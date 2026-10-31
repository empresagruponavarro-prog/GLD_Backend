import { NotFoundException } from '@nestjs/common';
import { toInstantString } from '../../../../platform/db/temporal.js';
import { readDateOnly } from '../obra-shared.js';
import { SEMANAS_AVANCE, SEMANAS_META, type EstadoObra, type MotivoReprogramacion, type ObraEntrada, type PartidaEntrada, type TipoPartida } from './control-avance.types.js';
import type { OrmObra } from './orm.js';

/** Qué falta para que la obra entre al Dashboard (RV-01…RV-03). */
export type CampoFaltante = 'estado_obra' | 'fecha_inicio' | 'fecha_fin_prog';

export interface IdsObra {
  /** `item` de la partida → id. */
  partidas: Map<string, number>;
  /** `item` de la subpartida → id. */
  subpartidas: Map<string, number>;
}

type FilaCc = NonNullable<Awaited<ReturnType<OrmObra['CentroCostos']['first']>>>;
type FilaGen = NonNullable<Awaited<ReturnType<OrmObra['obra_datos_generales']['first']>>>;
type FilaPartida = NonNullable<Awaited<ReturnType<OrmObra['obra_partida']['first']>>>;
type FilaSub = NonNullable<Awaited<ReturnType<OrmObra['obra_subpartida']['first']>>>;
type FilaSemana = NonNullable<Awaited<ReturnType<OrmObra['obra_subpartida_semana']['first']>>>;
type FilaReprog = NonNullable<Awaited<ReturnType<OrmObra['obra_reprogramacion']['first']>>>;

/** Lo leído de la BD para una obra (sin transformar). */
export interface FilasObra {
  cc: FilaCc;
  gen: FilaGen | null;
  partidas: FilaPartida[];
  subs: FilaSub[];
  semanas: FilaSemana[];
  reprog: FilaReprog[];
}

export interface ObraCargada {
  idCentroCosto: number;
  /** Filas de origen: sirven para completar con datos de pantalla (cliente, equipo, tienda…). */
  filas: FilasObra;
  estadoObra: EstadoObra | null;
  /** `null` si la obra aún no se puede evaluar (ver `faltantes`). */
  entrada: ObraEntrada | null;
  /** Estructura con metas y avance, disponible aunque la obra aún no se pueda evaluar. */
  partidas: PartidaEntrada[];
  faltantes: CampoFaltante[];
  ids: IdsObra;
  /** Inicio y fin resueltos (CentroCostos o, si faltan, el rango de las subpartidas). */
  inicio: string | null;
  fin: string | null;
  /** Inicio y fin tal como están en `CentroCostos` (sin el respaldo de las subpartidas). */
  inicioCc: string | null;
  finCc: string | null;
}

const num = (v: unknown): number => Number(v ?? 0);
const fecha = (v: unknown): string | null => (v ? readDateOnly(v) : null);

/**
 * Lee de la BD lo que escribe la gente y lo arma como `ObraEntrada` para el motor. Sirve tanto con
 * `db.orm.public` como con `tx.orm.public` (dentro de una transacción ve los cambios sin confirmar).
 *
 * Inicio y fin salen de `CentroCostos.fecha_inicio / fecha_fin_prog` (D12); si faltan se toman del
 * rango de las subpartidas (como el Excel, que usa las fechas de Partidas si la Ficha las deja vacías).
 */
export async function cargarObra(orm: OrmObra, idCentroCosto: number): Promise<ObraCargada> {
  const cc = await orm.CentroCostos.first({ id: idCentroCosto });
  if (!cc) throw new NotFoundException(`Centro de Costo ${idCentroCosto} no encontrado`);

  const [gen, partidas, subs, reprog] = await Promise.all([
    orm.obra_datos_generales.first({ id_centro_costo: idCentroCosto }),
    orm.obra_partida.where({ id_centro_costo: idCentroCosto }).all(),
    orm.obra_subpartida.where({ id_centro_costo: idCentroCosto }).all(),
    orm.obra_reprogramacion.where({ id_centro_costo: idCentroCosto }).all(),
  ]);
  const idsSub = subs.map((s) => s.id);
  const semanas = idsSub.length ? await orm.obra_subpartida_semana.where((s) => s.id_subpartida.in(idsSub)).all() : [];
  return armarObra({ cc, gen, partidas, subs, semanas, reprog });
}

/** Parte `ids` en lotes: Postgres admite como máximo 65 535 parámetros por consulta. */
export async function porLotes<T>(ids: readonly number[], consulta: (lote: number[]) => Promise<T[]>, tamano = 5000): Promise<T[]> {
  const salida: T[] = [];
  for (let i = 0; i < ids.length; i += tamano) salida.push(...(await consulta(ids.slice(i, i + tamano))));
  return salida;
}

/**
 * Carga masiva para el portafolio: todas las obras que participan del Dashboard (`estado_obra` no
 * nulo), o solo las de `soloIds`. Son 6 consultas en total, sin importar cuántas obras haya
 * (más una por cada 5 000 ids si se piden obras concretas), no una por obra.
 */
export async function cargarObras(orm: OrmObra, soloIds?: readonly number[]): Promise<ObraCargada[]> {
  const todas = await orm.obra_datos_generales.all();
  const activas = todas.filter((g) => g.estado_obra != null && (!soloIds || soloIds.includes(g.id_centro_costo)));
  if (activas.length === 0) return [];
  const idsCc = activas.map((g) => g.id_centro_costo);

  const [ccs, partidas, subs, reprog] = await Promise.all([
    porLotes(idsCc, async (l) => await orm.CentroCostos.where((c) => c.id.in(l)).all()),
    porLotes(idsCc, async (l) => await orm.obra_partida.where((p) => p.id_centro_costo.in(l)).all()),
    porLotes(idsCc, async (l) => await orm.obra_subpartida.where((s) => s.id_centro_costo.in(l)).all()),
    porLotes(idsCc, async (l) => await orm.obra_reprogramacion.where((r) => r.id_centro_costo.in(l)).all()),
  ]);
  // Semanas: para el portafolio completo es más barato leer la tabla entera (una consulta) que pedirla
  // por ids en lotes de 5 000 (medido: 1,2 s vs. varias consultas `IN` enormes). Solo hay filas de
  // obras con partidas, así que la tabla no crece más allá de lo que se va a usar.
  const idsSub = new Set(subs.map((s) => s.id));
  const semanas = soloIds
    ? await porLotes([...idsSub], async (l) => await orm.obra_subpartida_semana.where((w) => w.id_subpartida.in(l)).all())
    : (await orm.obra_subpartida_semana.all()).filter((w) => idsSub.has(w.id_subpartida));

  const agrupar = <T>(filas: T[], clave: (f: T) => number) => {
    const m = new Map<number, T[]>();
    for (const f of filas) m.set(clave(f), [...(m.get(clave(f)) ?? []), f]);
    return m;
  };
  const ccPorId = new Map(ccs.map((c) => [c.id, c]));
  const partidasPorCc = agrupar(partidas, (p) => p.id_centro_costo);
  const subsPorCc = agrupar(subs, (s) => s.id_centro_costo);
  const reprogPorCc = agrupar(reprog, (r) => r.id_centro_costo);
  const semanasPorSub = agrupar(semanas, (w) => w.id_subpartida);

  return activas.flatMap((gen) => {
    const cc = ccPorId.get(gen.id_centro_costo);
    if (!cc) return [];
    const susSubs = subsPorCc.get(cc.id) ?? [];
    return [
      armarObra({
        cc,
        gen,
        partidas: partidasPorCc.get(cc.id) ?? [],
        subs: susSubs,
        semanas: susSubs.flatMap((s) => semanasPorSub.get(s.id) ?? []),
        reprog: reprogPorCc.get(cc.id) ?? [],
      }),
    ];
  });
}

/** Arma la entrada del motor a partir de las filas leídas (sin acceso a la BD). */
export function armarObra(filas: FilasObra): ObraCargada {
  const { cc, gen, partidas: partidasDb, subs: subsDb, semanas: semanasDb, reprog: reprogDb } = filas;
  const idCentroCosto = cc.id;

  const porOrden = <T extends { orden: number | null; id: number }>(a: T, b: T) => (a.orden ?? 0) - (b.orden ?? 0) || a.id - b.id;
  const partidas = [...partidasDb].sort(porOrden);
  const subs = [...subsDb].sort(porOrden);

  // Metas (semanas 1-10) y avance (1-16) por subpartida
  const metas = new Map<number, (number | null)[]>();
  const avance = new Map<number, (number | null)[]>();
  let ultimoRegistro: string | null = null;
  for (const s of semanasDb) {
    if (s.numero_semana < 1 || s.numero_semana > SEMANAS_AVANCE) continue;
    if (s.meta != null && s.numero_semana <= SEMANAS_META) {
      const m = metas.get(s.id_subpartida) ?? Array<number | null>(SEMANAS_META).fill(null);
      m[s.numero_semana - 1] = num(s.meta);
      metas.set(s.id_subpartida, m);
    }
    if (s.avance != null) {
      const a = avance.get(s.id_subpartida) ?? Array<number | null>(SEMANAS_AVANCE).fill(null);
      a[s.numero_semana - 1] = num(s.avance);
      avance.set(s.id_subpartida, a);
    }
    if (s.registrado_en) {
      const dia = toInstantString(s.registrado_en).slice(0, 10);
      if (!ultimoRegistro || dia > ultimoRegistro) ultimoRegistro = dia;
    }
  }

  const ids: IdsObra = { partidas: new Map(partidas.map((p) => [p.item, p.id])), subpartidas: new Map(subs.map((s) => [s.item, s.id])) };

  const partidasEntrada: PartidaEntrada[] = partidas.map((p) => ({
    item: p.item,
    nombre: p.nombre,
    tipo: p.tipo as TipoPartida,
    subpartidas: subs
      .filter((s) => s.id_partida === p.id)
      .map((s) => ({
        item: s.item,
        nombre: s.nombre,
        tipo: (s.tipo as TipoPartida | null) ?? null,
        inicio: readDateOnly(s.fecha_inicio),
        fin: readDateOnly(s.fecha_fin),
        metas: metas.get(s.id) ?? null,
        avance: avance.get(s.id) ?? null,
      })),
  }));

  // Fechas de la obra
  const inicioCc = fecha(cc.fecha_inicio);
  const finCc = fecha(cc.fecha_fin_prog);
  const inicioSubs = subs.length ? subs.map((s) => readDateOnly(s.fecha_inicio)).sort()[0] : null;
  const finSubs = subs.length ? subs.map((s) => readDateOnly(s.fecha_fin)).sort().at(-1) ?? null : null;
  const inicio = inicioCc ?? inicioSubs;
  const fin = finCc ?? finSubs;

  const estadoObra = (gen?.estado_obra ?? null) as EstadoObra | null;
  const faltantes: CampoFaltante[] = [];
  if (!estadoObra) faltantes.push('estado_obra');
  if (!inicio) faltantes.push('fecha_inicio');
  if (!fin) faltantes.push('fecha_fin_prog');
  if (faltantes.length > 0 || !estadoObra || !inicio || !fin) {
    return { idCentroCosto, filas, estadoObra, entrada: null, partidas: partidasEntrada, faltantes, ids, inicio, fin, inicioCc, finCc };
  }

  const fechaActualizacion = [ultimoRegistro, gen?.updated_at ? toInstantString(gen.updated_at).slice(0, 10) : null].filter((x): x is string => !!x).sort().at(-1) ?? null;

  const entrada: ObraEntrada = {
    estado: estadoObra,
    inicio,
    fin,
    avanceGeneral: gen?.avance_general != null ? num(gen.avance_general) : null,
    fechaActualizacion,
    entregaReal: fecha(cc.fecha_fin_real),
    cierrePostVenta: fecha(gen?.fecha_cierre_postventa),
    plazoPostVentaDias: gen?.plazo_postventa_dias ?? null,
    reprogramaciones: [...reprogDb]
      .sort((a, b) => readDateOnly(a.desde).localeCompare(readDateOnly(b.desde)) || a.id - b.id)
      .map((r) => ({ desde: readDateOnly(r.desde), dias: r.dias, motivo: r.motivo as MotivoReprogramacion })),
    partidas: partidasEntrada,
  };
  return { idCentroCosto, filas, estadoObra, entrada, partidas: partidasEntrada, faltantes: [], ids, inicio, fin, inicioCc, finCc };
}
