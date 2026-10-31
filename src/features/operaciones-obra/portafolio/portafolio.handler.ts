import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { toInstantString } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { cargarObras, porLotes, type ObraCargada } from '../shared/control-avance/carga-obra.js';
import type { EstadoObra } from '../shared/control-avance/control-avance.types.js';
import { construirEquipo, idsDeEquipo } from '../shared/control-avance/equipo.js';
import { eventosDerivados, type UltimosEventos } from '../shared/control-avance/eventos-derivados.js';
import { calcularObra } from '../shared/control-avance/motor.js';
import { registrarEvento, type TipoEventoObra } from '../shared/control-avance/registrar-evento.js';
import { catalogosDe, filtrarObras, ordenarObras, resumirObra, type CatalogosPortafolio, type ObraResumen } from '../shared/control-avance/resumen-portafolio.js';
import { esFechaIso, hoyLima } from '../shared/obra-shared.js';
import type { ArbolObraDto, EventoPortafolioDto, EventosPortafolioQueryDto, ObraSinEvaluarDto, PortafolioDto, PortafolioQueryDto, SincronizacionDto } from './portafolio.dto.js';

/** Mientras no haya planificador, la lectura del portafolio dispara a lo sumo una evaluación de avisos por minuto. */
const INTERVALO_SINCRONIZACION_MS = 60_000;

function validarHoy(hoy: string | undefined): string {
  const fecha = hoy ?? hoyLima();
  if (!esFechaIso(fecha)) throw new BadRequestException(`Fecha inválida: ${fecha}`);
  return fecha;
}

interface ObrasCalculadas {
  hoy: string;
  resumenes: ObraResumen[];
  sinEvaluar: ObraSinEvaluarDto[];
}

@Injectable()
export class PortafolioHandler {
  private readonly logger = new Logger(PortafolioHandler.name);
  private enCurso: Promise<SincronizacionDto> | null = null;
  private ultimaSincronizacion = 0;

  constructor(@Inject(DB) private readonly db: Database) {}

  // ─── Lecturas ──────────────────────────────────────────────────────────────
  /** Todas las obras del Dashboard, ya filtradas y ordenadas (RC-21). */
  async listar(q: PortafolioQueryDto): Promise<PortafolioDto> {
    const hoy = validarHoy(q.hoy);
    const { resumenes, sinEvaluar } = await this.calcular(hoy);

    // Los avisos solo se generan con la fecha real: una consulta «como estaba» no debe escribir nada.
    if (q.hoy === undefined) void this.sincronizar(false, resumenes).catch((e: unknown) => this.logger.warn(`No se pudieron evaluar los avisos: ${String(e)}`));

    const obras = ordenarObras(
      filtrarObras(resumenes, {
        anio: q.anio,
        vigentesAnteriores: q.vigentesAnteriores,
        soloVigentes: q.soloVigentes,
        cliente: q.cliente,
        jefe: q.jefe,
        coordinador: q.coordinador,
        departamento: q.departamento,
        estado: q.estado as EstadoObra | undefined,
        q: q.q,
      }),
    );
    return { hoy, total: resumenes.length, obras, sin_evaluar: sinEvaluar };
  }

  /** Listas para los filtros: clientes, jefes, coordinadores, departamentos y años con obras. */
  async catalogos(hoyParam?: string): Promise<CatalogosPortafolio> {
    const { resumenes } = await this.calcular(validarHoy(hoyParam));
    return catalogosDe(resumenes);
  }

  /** Árbol partida › subpartida (con sus métricas) y Curva S de varias obras a la vez. */
  async arboles(ids: number[], hoyParam?: string): Promise<ArbolObraDto[]> {
    const hoy = validarHoy(hoyParam);
    const cargas = await cargarObras(this.db.orm.public, ids);
    return cargas.flatMap((c) => {
      if (!c.entrada) return [];
      const r = calcularObra(c.entrada, hoy);
      return [{ id_centro_costo: c.idCentroCosto, partidas: r.partidas, curvaS: r.curvaS }];
    });
  }

  /** Avisos y cambios recientes de todas las obras, del más reciente al más antiguo. */
  async eventos(q: EventosPortafolioQueryDto): Promise<EventoPortafolioDto[]> {
    const orm = this.db.orm.public;
    const limite = Math.min(Math.max(q.limite ?? 100, 1), 200);
    const tipos = q.tipos?.length ? (q.tipos as TipoEventoObra[]) : null;

    let consulta = orm.obra_evento.orderBy((e) => e.id.desc());
    if (tipos) consulta = orm.obra_evento.where((e) => e.tipo.in(tipos)).orderBy((e) => e.id.desc());
    // `desde` se compara con la fecha de creación; se pide de más porque el filtro por fecha es posterior.
    const filas = await consulta.limit(q.desde ? 1000 : limite).all();
    const visibles = (q.desde ? filas.filter((f) => toInstantString(f.created_at).slice(0, 10) >= q.desde!) : filas).slice(0, limite);

    const ids = [...new Set(visibles.map((f) => f.id_centro_costo))];
    const [ccs, gens] = await Promise.all([
      porLotes(ids, async (l) => await orm.CentroCostos.where((c) => c.id.in(l)).all()),
      porLotes(ids, async (l) => await orm.obra_datos_generales.where((g) => g.id_centro_costo.in(l)).all()),
    ]);
    const nombreCc = new Map(ccs.map((c) => [c.id, c.centro_costo ?? null]));
    const codigo = new Map(gens.map((g) => [g.id_centro_costo, g.codigo_obra ?? null]));

    return visibles.map((f) => ({
      id: f.id,
      id_centro_costo: f.id_centro_costo,
      codigo_obra: codigo.get(f.id_centro_costo) ?? null,
      centro_costo: nombreCc.get(f.id_centro_costo) ?? null,
      tipo: f.tipo,
      titulo: f.titulo,
      detalle: f.detalle ?? null,
      valor_antes: f.valor_antes ?? null,
      valor_despues: f.valor_despues ?? null,
      severidad: f.severidad,
      usuario: f.usuario ?? null,
      created_at: toInstantString(f.created_at),
    }));
  }

  // ─── Avisos derivados del tiempo (D17) ─────────────────────────────────────
  /**
   * Evalúa las obras en ejecución y guarda un evento cuando cambió su situación o venció su plazo.
   * Es idempotente: compara con el último evento de cada clase. Sin `forzar` respeta el intervalo
   * mínimo; si ya hay una evaluación en curso, espera a que termine en lugar de duplicarla.
   */
  async sincronizar(forzar = false, resumenes?: ObraResumen[]): Promise<SincronizacionDto> {
    if (this.enCurso) {
      await this.enCurso.catch(() => undefined);
      if (!forzar) return { creados: 0 };
    }
    if (!forzar && Date.now() - this.ultimaSincronizacion < INTERVALO_SINCRONIZACION_MS) return { creados: 0 };
    this.ultimaSincronizacion = Date.now();

    const trabajo = this.evaluar(resumenes);
    this.enCurso = trabajo;
    try {
      return await trabajo;
    } finally {
      this.enCurso = null;
    }
  }

  private async evaluar(resumenes?: ObraResumen[]): Promise<SincronizacionDto> {
    const lista = resumenes ?? (await this.calcular(hoyLima())).resumenes;
    const enEjecucion = lista.filter((o) => o.resultado.estadoEfectivo === 'EN_EJECUCION');
    if (enEjecucion.length === 0) return { creados: 0 };
    const idsEnEjecucion = new Set(enEjecucion.map((o) => o.id_centro_costo));

    // Último SITUACION y último VENCIDO de cada obra (las filas vienen del más nuevo al más antiguo).
    const orm = this.db.orm.public;
    const previos = new Map<number, UltimosEventos>();
    for (const tipo of ['SITUACION', 'VENCIDO'] as const) {
      const filas = await orm.obra_evento.where({ tipo }).orderBy((e) => e.id.desc()).all();
      for (const f of filas) {
        if (!idsEnEjecucion.has(f.id_centro_costo)) continue;
        const p = previos.get(f.id_centro_costo) ?? { situacion: null, vencidoDeFin: null };
        if (tipo === 'SITUACION' && p.situacion === null) p.situacion = f.valor_despues ?? null;
        if (tipo === 'VENCIDO' && p.vencidoDeFin === null) p.vencidoDeFin = f.valor_despues ?? null;
        previos.set(f.id_centro_costo, p);
      }
    }

    const nuevos = enEjecucion.flatMap((o) => eventosDerivados(o, previos.get(o.id_centro_costo) ?? { situacion: null, vencidoDeFin: null }));
    if (nuevos.length === 0) return { creados: 0 };

    await this.db.transaction(async (tx) => {
      for (const e of nuevos) {
        await registrarEvento(tx.orm.public, { idCentroCosto: e.idCentroCosto, tipo: e.tipo, titulo: e.titulo, detalle: e.detalle, antes: e.antes, despues: e.despues, severidad: e.severidad, usuario: null });
      }
    });
    return { creados: nuevos.length };
  }

  // ─── Cálculo ───────────────────────────────────────────────────────────────
  /** Calcula con el motor todas las obras del Dashboard. Son pocas consultas, no una por obra. */
  private async calcular(hoy: string): Promise<ObrasCalculadas> {
    const orm = this.db.orm.public;
    const cargas = await cargarObras(orm);

    // Nombres: cliente (nombre comercial) y equipo, en una sola pasada.
    const idsCliente = cargas.map((c) => c.filas.cc.id_anexo).filter((v): v is number => v != null);
    const idsPersona = idsDeEquipo(cargas.map((c) => c.filas.gen));
    const anexos = await porLotes([...new Set([...idsCliente, ...idsPersona])], async (l) => await orm.Anexos.where((a) => a.id.in(l)).all());
    const nombrePersona = new Map(anexos.map((a) => [a.id, a.Anexo ?? a.NombreComercial ?? '']));
    const nombreCliente = new Map(anexos.map((a) => [a.id, a.NombreComercial ?? a.Anexo ?? '']));

    const resumenes: ObraResumen[] = [];
    const sinEvaluar: ObraSinEvaluarDto[] = [];
    for (const c of cargas as ObraCargada[]) {
      if (!c.entrada) {
        sinEvaluar.push({ id_centro_costo: c.idCentroCosto, codigo_obra: c.filas.gen?.codigo_obra ?? null, centro_costo: c.filas.cc.centro_costo ?? null, faltantes: c.faltantes });
        continue;
      }
      const idCliente = c.filas.cc.id_anexo;
      resumenes.push(
        resumirObra(c, calcularObra(c.entrada, hoy), {
          cliente: idCliente != null ? { id: idCliente, nombre: nombreCliente.get(idCliente) ?? `#${idCliente}` } : null,
          equipo: construirEquipo(c.filas.gen, nombrePersona),
        }),
      );
    }
    return { hoy, resumenes, sinEvaluar };
  }
}
