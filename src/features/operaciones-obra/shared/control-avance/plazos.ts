import { DIAS_PROXIMO_A_VENCER, type Dia } from './control-avance.types.js';

/**
 * RC-14, RC-15, RC-16. Todas reciben `hoy` como parámetro (fecha de Lima, calculada por quien llama).
 */

/** Una obra con 99,95 % o más se considera terminada. */
const UMBRAL_TERMINADA = 99.95;

export interface EntradaFueraDePlazo {
  enEjecucion: boolean;
  inicio: Dia;
  real: number;
  finVigente: Dia;
  hoy: Dia;
}

/**
 * RC-14: obra en ejecución, iniciada, sin terminar y con el fin vigente ya pasado. Días = hoy −
 * fin vigente (se cuentan día a día). 0 si no está fuera de plazo.
 */
export function diasFueraDePlazo(e: EntradaFueraDePlazo): number {
  if (!e.enEjecucion || e.inicio > e.hoy || e.real >= UMBRAL_TERMINADA) return 0;
  return e.finVigente < e.hoy ? e.hoy - e.finVigente : 0;
}

export interface EntradaRetraso {
  enEjecucion: boolean;
  inicio: Dia;
  hoy: Dia;
  real: number;
  sinAvance: boolean;
  enPausa: boolean;
  /** Corte: domingo de la última semana cerrada. */
  corte: Dia;
  /** Programado de control de la obra a una fecha. */
  programadoEn: (d: Dia) => number;
  tolerancia: number;
}

/**
 * RC-15: cuántos días va detrás el avance real: el corte menos la última fecha en que el plan
 * pedía el avance que la obra tiene hoy. Solo obras en ejecución, iniciadas, sin pausa vigente y
 * con avance reportado. 0 si va al día.
 */
export function diasDeRetraso(e: EntradaRetraso): number {
  if (!e.enEjecucion || e.inicio > e.hoy || e.enPausa || e.sinAvance || e.real >= UMBRAL_TERMINADA) return 0;
  if (e.real + e.tolerancia >= e.programadoEn(e.corte)) return 0;
  let va = e.inicio - 1;
  for (let t = e.inicio; t <= e.corte; t++) {
    if (e.programadoEn(t) > e.real + 0.05) break;
    va = t;
  }
  return Math.max(0, e.corte - va);
}

export interface EntradaProximoAVencer {
  enEjecucion: boolean;
  inicio: Dia;
  finControl: Dia;
  hoy: Dia;
  dias?: number;
}

/** RC-16: obra en ejecución (ya iniciada) cuyo fin de control cae entre hoy y hoy + 7. */
export function proximoAVencer(e: EntradaProximoAVencer): boolean {
  if (!e.enEjecucion || e.inicio > e.hoy) return false;
  return e.finControl >= e.hoy && e.finControl <= e.hoy + (e.dias ?? DIAS_PROXIMO_A_VENCER);
}
