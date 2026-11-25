import { redondear2 } from './cuota.js';

/**
 * Tope de lo que puede consumir un contratista (hoja «3) CONTRATISTAS» del Excel de valorización): lo consumido es lo valorizado más los
 * descuentos registrados (materiales entregados, descuentos por facturación…) y el tope es el contrato menos el % de garantía. Es solo una
 * **alerta de lectura**: no bloquea nada. Lo que pase del tope se cubre con la garantía al liquidar (los deductivos pendientes se descuentan
 * de la devolución). **Puro.**
 *
 *   tope      = total × (100 − garantía %) / 100
 *   consumido = valorizado aprobado + deductivos no anulados (la penalidad no consume contrato: solo se descuenta del pago)
 */

export type EstadoTope = 'DENTRO' | 'CERCA' | 'EN_TOPE' | 'EXCEDE' | 'LIQUIDADO';

/** Desde este % del contrato consumido el semáforo pasa a amarillo (el Excel usa 80 %). */
export const UMBRAL_CERCA_PCT = 80;

export interface EntradaTope {
  /** Total bruto de la orden. */
  total: number;
  garantiaPct: number;
  /** Lo valorizado en las cuotas aprobadas (bruto). */
  valorizado: number;
  /** Deductivos que consumen contrato (sin anular y sin penalidades). */
  deductivos: number;
  liquidado?: boolean;
}

export interface TopeContrato {
  total: number;
  tope: number;
  consumido: number;
  /** Consumido sobre el contrato (0-100+). */
  consumidoPct: number;
  /** Lo que todavía se puede consumir sin pasar el tope. */
  saldoHastaTope: number;
  /** Lo que pasa del tope: se cubre con la garantía al liquidar. */
  exceso: number;
  estado: EstadoTope;
}

export function calcularTope(e: EntradaTope): TopeContrato {
  const total = Math.max(redondear2(e.total), 0);
  const garantia = Math.min(Math.max(e.garantiaPct, 0), 100);
  const tope = redondear2((total * (100 - garantia)) / 100);
  const consumido = redondear2(Math.max(e.valorizado, 0) + Math.max(e.deductivos, 0));
  const saldoHastaTope = Math.max(redondear2(tope - consumido), 0);
  const exceso = Math.max(redondear2(consumido - tope), 0);
  const consumidoPct = total > 0 ? Math.round((consumido / total) * 10000) / 100 : 0;
  let estado: EstadoTope;
  if (e.liquidado) estado = 'LIQUIDADO';
  else if (exceso > 0.005) estado = 'EXCEDE';
  else if (saldoHastaTope <= 0.005 && total > 0) estado = 'EN_TOPE';
  else if (consumidoPct >= UMBRAL_CERCA_PCT) estado = 'CERCA';
  else estado = 'DENTRO';
  return { total, tope, consumido, consumidoPct, saldoHastaTope, exceso, estado };
}

/** Texto de la alerta, como en la hoja del Excel. */
export function mensajeTope(t: TopeContrato): string {
  const f = (n: number) => n.toFixed(2);
  switch (t.estado) {
    case 'LIQUIDADO':
      return 'Contrato liquidado';
    case 'EXCEDE':
      return `Excede el tope en ${f(t.exceso)}: se descuenta de la garantía al liquidar`;
    case 'EN_TOPE':
      return 'En el tope: no queda margen para consumir más';
    case 'CERCA':
      return `Cerca del tope: quedan ${f(t.saldoHastaTope)} por consumir`;
    default:
      return `Dentro del margen: quedan ${f(t.saldoHastaTope)} hasta el tope`;
  }
}
