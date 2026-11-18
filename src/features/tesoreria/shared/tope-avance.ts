/**
 * Tope de pago de una orden de servicio del presupuesto según el avance de obra (plan 09, respuesta 6 y D-13). **Puro.**
 *
 * El primer pago es el adelanto de la cotización; los siguientes se liberan según el avance que informa Operaciones. Lo pagado más lo
 * programado del concepto PROVEEDOR no puede superar `neto × max(adelanto %, avance %)` (nunca más del neto).
 */

/** Una línea de la orden con el avance real (0-100) de la subfase que la imputa; `null` = la obra no la tiene en el control de avance. */
export interface LineaTope {
  monto: number;
  avance: number | null;
}

export interface Tope {
  /** % de adelanto de la cotización (0 si no pidió). */
  adelantoPct: number;
  /** Avance de la orden: el de cada línea ponderado por su monto (0-100). */
  avancePct: number;
  /** El mayor entre adelanto y avance, hasta 100. */
  pctAplicado: number;
  /** Lo máximo que se puede haber pagado o programado, en la moneda del documento. */
  tope: number;
}

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const acotar = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

/** Avance de la orden: promedio del avance de sus líneas ponderado por su monto. Sin montos o sin avance, 0. */
export function avanceDeLineas(lineas: readonly LineaTope[]): number {
  const total = lineas.reduce((a, l) => a + Math.max(0, l.monto), 0);
  if (total <= 0) return 0;
  const valorizado = lineas.reduce((a, l) => a + Math.max(0, l.monto) * acotar(l.avance ?? 0), 0);
  return redondear(valorizado / total);
}

export function topeAvance(neto: number, adelantoPct: number, lineas: readonly LineaTope[]): Tope {
  const adelanto = acotar(adelantoPct);
  const avance = avanceDeLineas(lineas);
  const pctAplicado = Math.max(adelanto, avance);
  return { adelantoPct: adelanto, avancePct: avance, pctAplicado, tope: redondear((Math.max(0, neto) * pctAplicado) / 100) };
}

/** Lo que todavía se puede programar sin pasar el tope. */
export function disponibleAvance(tope: number, pagado: number, programado: number): number {
  return redondear(Math.max(tope - pagado - programado, 0));
}

/**
 * Monto que la programación propone: el adelanto si todavía no hay pagos ni programaciones y, después, lo que el avance ya liberó
 * (el disponible).
 */
export function montoSugerido(neto: number, adelantoPct: number, tope: number, pagado: number, programado: number): number {
  if (pagado + programado <= 0) return redondear((Math.max(0, neto) * acotar(adelantoPct)) / 100);
  return disponibleAvance(tope, pagado, programado);
}

/** ¿Programar `monto` más pasa el tope? (con una tolerancia de centavos). */
export function superaTope(tope: number, pagado: number, programado: number, monto: number): boolean {
  return pagado + programado + monto > tope + 0.005;
}
