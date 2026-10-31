import { diasLaborables } from './calendario.js';
import { SEMANAS_META, type Dia } from './control-avance.types.js';

/**
 * RC-03, RC-04, RC-05.
 * Una subpartida pesa lo que duran sus días laborables; su meta de cada semana (1-10) es el
 * porcentaje que se espera completar esa semana y suma 100.
 */

export interface TramoSubpartida {
  inicio: Dia;
  fin: Dia;
}

/** RC-03: peso = días laborables de la subpartida (mínimo 1). */
export function peso(sub: TramoSubpartida): number {
  return Math.max(1, diasLaborables(sub.inicio, sub.fin));
}

/**
 * RC-04: meta automática de cada semana = días laborables de la subpartida en esa semana ÷ sus
 * días laborables totales, redondeada a 0,1. Se obtiene de las diferencias del acumulado, como
 * en la plantilla Excel.
 */
export function metasPorDefecto(sub: TramoSubpartida, w1: Dia): number[] {
  const total = diasLaborables(sub.inicio, sub.fin);
  const acumulado = (k: number): number => {
    if (k <= 0) return 0;
    const domingo = w1 + 7 * k - 1;
    if (domingo < sub.inicio) return 0;
    if (!total) return domingo >= sub.fin ? 100 : 0;
    return Math.round((diasLaborables(sub.inicio, Math.min(domingo, sub.fin)) / total) * 1000) / 10;
  };
  const metas: number[] = [];
  for (let k = 1; k <= SEMANAS_META; k++) metas.push(Math.round((acumulado(k) - acumulado(k - 1)) * 10) / 10);
  return metas;
}

/** Meta de cada semana: la escrita a mano o, si la celda está vacía, el reparto automático. */
export function metasEfectivas(sub: TramoSubpartida, w1: Dia, manuales?: readonly (number | null | undefined)[] | null): number[] {
  const auto = metasPorDefecto(sub, w1);
  return auto.map((m, i) => {
    const manual = manuales?.[i];
    return manual == null || !Number.isFinite(manual) ? m : manual;
  });
}

/**
 * RC-05: meta acumulada de una subpartida al día `d` (inclusive): las semanas completas
 * anteriores más la fracción de la semana de `d` según sus días laborables. Tope 100.
 */
export function pactadoAcumulado(sub: TramoSubpartida, metas: readonly number[], w1: Dia, d: Dia): number {
  if (d < w1) return 0;
  const c = Math.floor((d - w1) / 7) + 1;
  if (c > SEMANAS_META) return Math.min(100, metas.reduce((a, v) => a + v, 0));
  let v = 0;
  for (let k = 0; k < c - 1; k++) v += metas[k] ?? 0;
  const mc = metas[c - 1] ?? 0;
  if (mc) {
    const lunes = w1 + 7 * (c - 1);
    const domingo = lunes + 6;
    const a = Math.max(sub.inicio, lunes);
    const b = Math.min(sub.fin, domingo);
    const den = b < a ? 0 : diasLaborables(a, b);
    v += mc * (d >= domingo ? 1 : den ? diasLaborables(a, Math.min(d, b)) / den : 0);
  }
  return Math.min(100, v);
}
