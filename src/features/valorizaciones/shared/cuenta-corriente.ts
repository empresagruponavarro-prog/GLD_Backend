import { redondear2 } from './cuota.js';

/**
 * Cuenta corriente del contratista por orden (plan 12, R-16). **Puro.** Cada cuota aprobada **devenga** lo que se le debe (su neto) y cada
 * pago lo **abona**; la garantía retenida se lleva aparte, porque no se debe hasta que vence. El saldo es lo devengado menos lo pagado.
 */

export type TipoMovimiento = 'CUOTA' | 'PAGO' | 'GARANTIA_RETENIDA' | 'GARANTIA_DEVUELTA';

export interface Movimiento {
  fecha: string;
  tipo: TipoMovimiento;
  descripcion: string;
  /** Lo que se le debe al contratista (cuota aprobada, devolución de garantía). */
  devengado?: number;
  /** Lo que se le pagó. */
  pagado?: number;
  /** Garantía que se retiene (positivo) o se devuelve (positivo, en GARANTIA_DEVUELTA). */
  garantia?: number;
}

export interface FilaCuenta extends Movimiento {
  /** Saldo acumulado: devengado − pagado. */
  saldo: number;
  /** Garantía retenida acumulada: retenida − devuelta. */
  garantiaRetenida: number;
}

export interface CuentaCorriente {
  filas: FilaCuenta[];
  devengado: number;
  pagado: number;
  saldo: number;
  garantiaRetenida: number;
}

const ORDEN: Record<TipoMovimiento, number> = { CUOTA: 0, GARANTIA_RETENIDA: 1, GARANTIA_DEVUELTA: 2, PAGO: 3 };

export function armarCuentaCorriente(movimientos: readonly Movimiento[]): CuentaCorriente {
  const ordenados = [...movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha) || ORDEN[a.tipo] - ORDEN[b.tipo]);
  let devengado = 0;
  let pagado = 0;
  let garantia = 0;
  const filas = ordenados.map<FilaCuenta>((m) => {
    devengado = redondear2(devengado + (m.devengado ?? 0));
    pagado = redondear2(pagado + (m.pagado ?? 0));
    if (m.tipo === 'GARANTIA_RETENIDA') garantia = redondear2(garantia + (m.garantia ?? 0));
    if (m.tipo === 'GARANTIA_DEVUELTA') garantia = redondear2(garantia - (m.garantia ?? 0));
    return { ...m, saldo: redondear2(devengado - pagado), garantiaRetenida: garantia };
  });
  return { filas, devengado, pagado, saldo: redondear2(devengado - pagado), garantiaRetenida: garantia };
}
