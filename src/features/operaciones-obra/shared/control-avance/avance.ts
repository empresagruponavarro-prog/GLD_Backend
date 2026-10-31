/**
 * RC-06, RC-10, RC-11.
 * El avance se escribe por semana (lo avanzado SOLO en esa semana); el real acumulado es la suma.
 */

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** ¿Hay al menos un avance escrito? (un 0 también cuenta como reporte). */
export function tieneAvance(avance: readonly (number | null | undefined)[] | null | undefined): boolean {
  return (avance ?? []).some(esNumero);
}

/**
 * RC-06: real acumulado = suma de los avances semanales. Si la suma redondeada a 0,1 llega a
 * 99,5 se toma 100; tope 100. `null` si no hay ningún avance escrito (la celda del Excel queda
 * vacía y las fórmulas lo tratan como 0).
 */
export function realAcumulado(avance: readonly (number | null | undefined)[] | null | undefined): number | null {
  const valores = (avance ?? []).filter(esNumero);
  if (valores.length === 0) return null;
  const suma = Math.round(valores.reduce((a, v) => a + v, 0) * 10) / 10;
  return suma >= 99.5 ? 100 : Math.min(100, suma);
}

/** Real acumulado hasta la semana `c` (1-based) inclusive: lo que dibuja la Curva S. */
export function realHastaSemana(avance: readonly (number | null | undefined)[] | null | undefined, c: number): number {
  const s = (avance ?? []).reduce<number>((a, v, i) => a + (i < c && esNumero(v) ? v : 0), 0);
  return s >= 99.5 ? 100 : Math.min(100, s);
}

export interface ValorPonderado {
  peso: number;
  valor: number;
}

/** RC-10: promedio ponderado por peso (días laborables). 0 si no hay peso. */
export function promedioPonderado(items: readonly ValorPonderado[]): number {
  const w = items.reduce((a, x) => a + x.peso, 0);
  if (!w) return 0;
  return items.reduce((a, x) => a + x.peso * x.valor, 0) / w;
}

/**
 * RC-10: valor mostrado, truncado hacia abajo como el Excel (99,6 % se muestra 99 %; solo el
 * 100 % exacto es 100).
 */
export function truncar(x: number): number {
  return Math.floor(Number(x.toFixed(6)));
}

/** RC-11: desviación = real − programado, en puntos porcentuales. */
export function desviacion(real: number, programado: number): number {
  return real - programado;
}
