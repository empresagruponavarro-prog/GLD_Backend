import { deDia, semanaDeFecha } from './calendario.js';
import { realHastaSemana, tieneAvance } from './avance.js';
import { SEMANAS_AVANCE, type CurvaS, type Dia, type PuntoCurvaS } from './control-avance.types.js';
import { pactadoAcumulado } from './metas.js';
import { diasPausa, pactadoControl, type Pausa } from './reprogramacion.js';

/**
 * RC-22 y RC-23. Curva S de una obra: pactado vs real acumulado por semana de calendario.
 */

export interface SubpartidaCurva {
  inicio: Dia;
  fin: Dia;
  peso: number;
  /** Metas efectivas (10 semanas). */
  metas: readonly number[];
  avance: readonly (number | null)[];
  adicional: boolean;
}

export interface ContextoCurvaS {
  subpartidas: readonly SubpartidaCurva[];
  w1: Dia;
  hoy: Dia;
  /** Obra en ejecución (o próxima): si no, el real se dibuja igual al pactado. */
  enEjecucion: boolean;
  semanaEnCurso: number;
  semanasCerradas: number;
  finVigente: Dia;
  pausas: readonly Pausa[];
  externas: readonly Pausa[];
}

export type FiltroTipoCurva = 'todo' | 'C' | 'A';

/**
 * RC-22: para cada semana, el pactado de control acumulado (corrido por pausas externas), el
 * pactado original (sin pausas), el real acumulado (solo hasta la semana en curso) y las semanas
 * enteras en pausa. RC-23: el filtro separa lo contractual de los adicionales.
 * Devuelve `null` si no hay subpartidas para el filtro.
 */
export function curvaS(ctx: ContextoCurvaS, tipo: FiltroTipoCurva = 'todo'): CurvaS | null {
  const subs = ctx.subpartidas.filter((s) => tipo === 'todo' || (tipo === 'A') === s.adicional);
  if (subs.length === 0) return null;

  const W = subs.reduce((a, s) => a + s.peso, 0);
  const kFin = Math.max(1, semanaDeFecha(ctx.w1, ctx.finVigente));
  const n = Math.max(1, Math.min(SEMANAS_AVANCE, kFin));
  const hayAvance = subs.some((s) => tieneAvance(s.avance));

  const semanas: PuntoCurvaS[] = [];
  for (let i = 1; i <= n; i++) {
    const desde = ctx.w1 + 7 * (i - 1);
    const hasta = desde + 6;
    const pactado = subs.reduce((a, s) => a + s.peso * pactadoControl(s, s.metas, ctx.w1, hasta, ctx.externas), 0) / W;
    const pactadoOriginal = subs.reduce((a, s) => a + s.peso * pactadoAcumulado(s, s.metas, ctx.w1, hasta), 0) / W;
    const diasEnSemana = diasPausa(ctx.pausas, hasta) - diasPausa(ctx.pausas, desde - 1);

    let real: number | null = null;
    if (!ctx.enEjecucion) real = pactado;
    else if (hayAvance && i <= ctx.semanaEnCurso) real = subs.reduce((a, s) => a + s.peso * realHastaSemana(s.avance, i), 0) / W;

    semanas.push({
      semana: i,
      desde: deDia(desde),
      hasta: deDia(hasta),
      pactado,
      pactadoOriginal,
      real,
      diasPausa: diasEnSemana,
      semanaEnPausa: diasEnSemana >= 7,
      enCurso: ctx.hoy >= desde && ctx.hoy <= hasta,
    });
  }

  return {
    inicioSemana1: deDia(ctx.w1),
    semanas,
    semanaCorte: Math.max(0, Math.min(n, ctx.semanasCerradas)),
    excede: kFin > SEMANAS_AVANCE,
  };
}
