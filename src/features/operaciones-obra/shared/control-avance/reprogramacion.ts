import { pactadoAcumulado, type TramoSubpartida } from './metas.js';
import type { Dia, MotivoReprogramacion } from './control-avance.types.js';

/**
 * RC-09. Una reprogramación es una pausa de N días desde una fecha. NO cambia las fechas de las
 * subpartidas: la línea base se conserva y el plan de control se corre con las pausas externas.
 *  - Causa externa (cliente, permisos, proveedor del cliente, fuerza mayor): no es atraso.
 *  - Causa interna: sí es atraso; la obra se sigue midiendo contra su plan original.
 */

export interface Pausa {
  desde: Dia;
  dias: number;
  externa: boolean;
}

export function esMotivoExterno(motivo: MotivoReprogramacion): boolean {
  return motivo !== 'INTERNO';
}

/** Días de pausa transcurridos hasta el día `t` (inclusive). */
export function diasPausa(pausas: readonly Pausa[], t: Dia): number {
  return pausas.reduce((a, p) => a + Math.max(0, Math.min(p.dias, t - p.desde + 1)), 0);
}

export function soloExternas(pausas: readonly Pausa[]): Pausa[] {
  return pausas.filter((p) => p.externa);
}

const suma = (pausas: readonly Pausa[]) => pausas.reduce((a, p) => a + p.dias, 0);

/** Fin vigente = fin original + todos los días reprogramados. */
export function finVigente(finOriginal: Dia, pausas: readonly Pausa[]): Dia {
  return finOriginal + suma(pausas);
}

/** Fin de control = fin original + solo los días de causa externa (plazos y vencimientos). */
export function finControl(finOriginal: Dia, pausas: readonly Pausa[]): Dia {
  return finOriginal + suma(soloExternas(pausas));
}

export interface ResumenReprogramacion {
  diasReprogramados: number;
  diasExternos: number;
  diasInternos: number;
}

export function resumenReprogramacion(pausas: readonly Pausa[]): ResumenReprogramacion {
  const externos = suma(soloExternas(pausas));
  const total = suma(pausas);
  return { diasReprogramados: total, diasExternos: externos, diasInternos: total - externos };
}

/** Pausa en la que cae `hoy` (desde ≤ hoy < desde + días), si hay una. */
export function pausaVigente(pausas: readonly Pausa[], hoy: Dia): Pausa | null {
  return pausas.find((p) => p.desde <= hoy && hoy < p.desde + p.dias) ?? null;
}

/**
 * Programado de control al día `d`: el pactado corrido por las pausas externas ya transcurridas,
 * pactado(d − días de pausa externa hasta d).
 */
export function pactadoControl(sub: TramoSubpartida, metas: readonly number[], w1: Dia, d: Dia, externas: readonly Pausa[]): number {
  return pactadoAcumulado(sub, metas, w1, d - diasPausa(externas, d));
}
