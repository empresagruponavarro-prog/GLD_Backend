import { AlmacenSql, T, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';

export interface TipoCambioVigente {
  fecha: string;
  compra: string;
  venta: string;
  /** `false` si no hay tipo de cambio de la fecha pedida y se uso el ultimo anterior. */
  exacto: boolean;
}

/** Normaliza el id de moneda del documento a la clave de `tipo_cambio_diario` (USD, EUR…). */
export function claveMoneda(monedaId: string | null | undefined, simbolo?: string | null): string {
  const id = (monedaId ?? '').trim().toUpperCase();
  if (id === 'USD' || (simbolo ?? '').includes('$')) return 'USD';
  return id;
}

/** Tipo de cambio de la fecha o el ultimo anterior; `null` si nunca se registro uno. */
export async function tcVigente(sql: AlmacenSql, moneda: string, fecha: string, tx?: Tx): Promise<TipoCambioVigente | null> {
  const q = sqlTag(sql);
  const [row] = await q.rows<{ fecha: string; compra: string; venta: string }>({ fecha: T, compra: T, venta: T }, tx)`
    SELECT fecha::text AS fecha, compra::text AS compra, venta::text AS venta
      FROM tipo_cambio_diario
     WHERE moneda_id = ${moneda}::text AND fecha <= ${fecha}::date
     ORDER BY fecha DESC LIMIT 1`;
  return row ? { ...row, exacto: row.fecha === fecha } : null;
}
