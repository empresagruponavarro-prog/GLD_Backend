import { AlmacenSql, I, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';

export type Concepto = 'PROVEEDOR' | 'DETRACCION';

export interface SaldoConcepto {
  pagado: number;
  programado: number;
  ultimoPago: string | null;
}

export interface SaldosDocumento {
  PROVEEDOR: SaldoConcepto;
  DETRACCION: SaldoConcepto;
}

const vacio = (): SaldoConcepto => ({ pagado: 0, programado: 0, ultimoPago: null });

/** Pagado y programado por documento de origen y concepto (pagos REGISTRADO, programaciones PROGRAMADO). */
export async function saldosPago(sql: AlmacenSql, ids: number[], tx?: Tx): Promise<Map<number, SaldosDocumento>> {
  const result = new Map<number, SaldosDocumento>();
  for (const id of ids) result.set(id, { PROVEEDOR: vacio(), DETRACCION: vacio() });
  if (ids.length === 0) return result;
  const q = sqlTag(sql);
  const lista = csv(ids);

  const pagos = await q.rows<{ id: number; concepto: string; monto: string; ultimo: string | null }>(
    { id: I, concepto: T, monto: T, ultimo: TN },
    tx,
  )`
    SELECT id_documento_origen AS id, concepto::text AS concepto, SUM(monto)::text AS monto, MAX(fecha_pago)::text AS ultimo
      FROM pago
     WHERE estado = 'REGISTRADO' AND id_documento_origen = ANY(string_to_array(${lista}::text, ',')::int[])
     GROUP BY id_documento_origen, concepto`;
  for (const p of pagos) {
    const s = result.get(p.id)?.[p.concepto as Concepto];
    if (s) {
      s.pagado = Number(p.monto);
      s.ultimoPago = p.ultimo;
    }
  }

  const prog = await q.rows<{ id: number; concepto: string; monto: string }>({ id: I, concepto: T, monto: T }, tx)`
    SELECT id_documento_origen AS id, concepto::text AS concepto, SUM(monto)::text AS monto
      FROM pago_programado
     WHERE estado = 'PROGRAMADO' AND id_documento_origen = ANY(string_to_array(${lista}::text, ',')::int[])
     GROUP BY id_documento_origen, concepto`;
  for (const p of prog) {
    const s = result.get(p.id)?.[p.concepto as Concepto];
    if (s) s.programado = Number(p.monto);
  }
  return result;
}

export type EstadoPago = 'SIN_PROGRAMAR' | 'PROGRAMADO' | 'PARCIAL' | 'PAGADO' | 'ANULADO';

const EPS = 0.005;

/** Estado de pago calculado (plan 06 §3). `neto` en la moneda del documento; `detraccion` en soles. */
export function estadoPago(anulado: boolean, neto: number, detraccion: number, s: SaldosDocumento): EstadoPago {
  if (anulado) return 'ANULADO';
  const debe = neto > EPS || detraccion > EPS;
  const completoProv = s.PROVEEDOR.pagado >= neto - EPS;
  const completoDet = s.DETRACCION.pagado >= detraccion - EPS;
  if (debe && completoProv && completoDet) return 'PAGADO';
  if (s.PROVEEDOR.pagado > 0 || s.DETRACCION.pagado > 0) return 'PARCIAL';
  if (s.PROVEEDOR.programado > 0 || s.DETRACCION.programado > 0) return 'PROGRAMADO';
  return 'SIN_PROGRAMAR';
}
