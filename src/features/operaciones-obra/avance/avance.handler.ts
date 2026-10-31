import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { nowInstant } from '../../../platform/db/temporal.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { realAcumulado, truncar } from '../shared/control-avance/avance.js';
import { aDia, deDia, semanaObra } from '../shared/control-avance/calendario.js';
import { cargarObra } from '../shared/control-avance/carga-obra.js';
import { SEMANAS_AVANCE } from '../shared/control-avance/control-avance.types.js';
import { metasEfectivas } from '../shared/control-avance/metas.js';
import { calcularObra, estadoEfectivo } from '../shared/control-avance/motor.js';
import { registrarEvento } from '../shared/control-avance/registrar-evento.js';
import { hoyLima } from '../shared/obra-shared.js';
import type { AvanceObraDto, GuardarAvanceSemanaDto, ResultadoGuardarAvanceDto } from './avance.dto.js';

const TOPE_SUMA = 100.5; // RV-07: la suma de las semanas no debe pasar de 100 (0,5 de tolerancia por redondeo)

@Injectable()
export class AvanceHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Grilla de la obra: subpartidas × semanas, con las metas efectivas y el avance reportado. */
  async obtener(idCentroCosto: number, hoy: string = hoyLima()): Promise<AvanceObraDto> {
    const carga = await cargarObra(this.db.orm.public, idCentroCosto);
    if (!carga.inicio) throw new BadRequestException('Defina el inicio de la obra para registrar avance');
    const cal = semanaObra(aDia(carga.inicio), aDia(hoy));

    // Sin estado de obra la entrada del motor no existe, pero la grilla sí se puede mostrar.
    const origen = carga.partidas;

    const semanas = Array.from({ length: SEMANAS_AVANCE }, (_v, i) => {
      const desde = cal.w1 + 7 * i;
      return { numero: i + 1, desde: deDia(desde), hasta: deDia(desde + 6), futura: i + 1 > cal.semanaEnCurso, en_curso: i + 1 === cal.semanaEnCurso };
    });

    return {
      hoy,
      inicio_semana_1: deDia(cal.w1),
      semana_en_curso: cal.semanaEnCurso,
      semanas,
      subpartidas: origen.flatMap((p) =>
        p.subpartidas.map((s) => {
          const metas = metasEfectivas({ inicio: aDia(s.inicio), fin: aDia(s.fin) }, cal.w1, s.metas);
          const avance = Array.from({ length: SEMANAS_AVANCE }, (_v, i) => s.avance?.[i] ?? null);
          return {
            id: carga.ids.subpartidas.get(s.item) ?? 0,
            item: s.item,
            partida_item: p.item,
            partida_nombre: p.nombre,
            nombre: s.nombre,
            fecha_inicio: s.inicio,
            fecha_fin: s.fin,
            metas,
            avance,
            real_acumulado: realAcumulado(avance) ?? 0,
          };
        }),
      ),
    };
  }

  async guardarSemana(idCentroCosto: number, semana: number, dto: GuardarAvanceSemanaDto, usuario: string, hoy: string = hoyLima()): Promise<ResultadoGuardarAvanceDto> {
    if (!Number.isInteger(semana) || semana < 1 || semana > SEMANAS_AVANCE) {
      throw new BadRequestException(`La semana debe estar entre 1 y ${SEMANAS_AVANCE}`);
    }
    const antes = await cargarObra(this.db.orm.public, idCentroCosto);
    if (!antes.inicio) throw new BadRequestException('Defina el inicio de la obra para registrar avance');
    if (!antes.estadoObra) throw new ConflictException('La obra no participa del control de avance: defina su estado primero');
    const hoyDia = aDia(hoy);
    if (estadoEfectivo(antes.estadoObra, aDia(antes.inicio), hoyDia) !== 'EN_EJECUCION') {
      throw new ConflictException('Solo se registra avance en obras en ejecución');
    }
    const cal = semanaObra(aDia(antes.inicio), hoyDia);
    if (semana > cal.semanaEnCurso) {
      throw new BadRequestException(`La semana ${semana} aún no llega (la semana en curso es la ${cal.semanaEnCurso}): no se puede registrar avance futuro (RV-10)`);
    }

    // Validar cada línea contra la estructura y la suma acumulada de la subpartida.
    const idsValidos = new Set(antes.ids.subpartidas.values());
    const vistos = new Set<number>();
    const otrasSemanas = new Map<number, number>(); // suma de las demás semanas por subpartida
    const filas = await this.db.orm.public.obra_subpartida_semana.where((s) => s.id_subpartida.in([...idsValidos])).all();
    for (const f of filas) {
      if (f.avance != null && f.numero_semana !== semana) otrasSemanas.set(f.id_subpartida, (otrasSemanas.get(f.id_subpartida) ?? 0) + Number(f.avance));
    }
    for (const l of dto.lineas) {
      if (!idsValidos.has(l.idSubpartida)) throw new BadRequestException(`La subpartida ${l.idSubpartida} no pertenece a esta obra`);
      if (vistos.has(l.idSubpartida)) throw new BadRequestException(`La subpartida ${l.idSubpartida} viene repetida`);
      vistos.add(l.idSubpartida);
      if (l.avance === null || l.avance === undefined) continue;
      if (typeof l.avance !== 'number' || !Number.isFinite(l.avance) || l.avance < 0 || l.avance > 100) {
        throw new BadRequestException(`El avance de la subpartida ${l.idSubpartida} debe ser un número de 0 a 100 (lo de esa semana, sin %)`);
      }
      if (l.avance > 0 && l.avance < 1) {
        throw new BadRequestException(`El avance de la subpartida ${l.idSubpartida} es menor a 1: escriba 50, no 0,5 ni 50% (RV-09)`);
      }
      const suma = (otrasSemanas.get(l.idSubpartida) ?? 0) + l.avance;
      if (suma > TOPE_SUMA) {
        throw new BadRequestException(`La subpartida ${l.idSubpartida} sumaría ${Math.round(suma * 10) / 10}%: el avance de todas las semanas no puede pasar de 100% (RV-07)`);
      }
    }

    const realAntes = antes.entrada ? truncar(calcularObra(antes.entrada, hoy).real) : null;
    let realDespues: number | null = null;

    await this.db.transaction(async (tx) => {
      const t = tx.orm.public;
      for (const l of dto.lineas) {
        const fila = await t.obra_subpartida_semana.first({ id_subpartida: l.idSubpartida, numero_semana: semana });
        if (l.avance === null || l.avance === undefined) {
          if (fila) {
            if (fila.meta == null) await t.obra_subpartida_semana.where({ id: fila.id }).delete();
            else await t.obra_subpartida_semana.where({ id: fila.id }).update({ avance: null, registrado_por: null, registrado_en: null });
          }
          continue;
        }
        const valor = String(Math.round(l.avance * 10) / 10);
        const registro = { avance: valor, registrado_por: toVarchar<255>(usuario), registrado_en: nowInstant() };
        if (fila) await t.obra_subpartida_semana.where({ id: fila.id }).update(registro);
        else await t.obra_subpartida_semana.create({ id_subpartida: l.idSubpartida, numero_semana: semana, ...registro });
      }

      const despues = await cargarObra(t, idCentroCosto);
      realDespues = despues.entrada ? truncar(calcularObra(despues.entrada, hoy).real) : null;
      await registrarEvento(t, {
        idCentroCosto,
        tipo: 'AVANCE',
        titulo: `Avance de la semana ${semana} (${dto.lineas.length} subpartida${dto.lineas.length === 1 ? '' : 's'})`,
        antes: realAntes === null ? null : `${realAntes}%`,
        despues: realDespues === null ? null : `${realDespues}%`,
        usuario,
      });
    });

    return { semana, lineas: dto.lineas.length, real_antes: realAntes, real_despues: realDespues };
  }
}
