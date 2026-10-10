import { AlmacenSql, I, T, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';

export type AvanceRequerimiento = 'SIN_ATENDER' | 'PARCIAL' | 'ATENDIDO';

/** Cantidad ordenada (suma de lineas de OC) por linea de FUR. Solo devuelve lineas con OC. */
export async function ordenadoPorDetalle(
  sql: AlmacenSql,
  idsDetalle: number[],
  tx?: Tx,
  excluirOc = 0,
): Promise<Map<number, string>> {
  if (idsDetalle.length === 0) return new Map();
  const q = sqlTag(sql);
  const rows = await q.rows<{ id: number; ordenado: string }>({ id: I, ordenado: T }, tx)`
    SELECT l.id_requerimiento_detalle AS id, SUM(l."Cantidad")::text AS ordenado
      FROM "ordenCompraDetalle" l
     WHERE l.id_requerimiento_detalle = ANY(string_to_array(${csv(idsDetalle)}::text, ',')::int[])
       AND (${excluirOc}::int = 0 OR l.id_orden_compra IS DISTINCT FROM ${excluirOc}::int)
     GROUP BY l.id_requerimiento_detalle`;
  return new Map(rows.map((r) => [r.id, r.ordenado]));
}

/** Avance de atencion de cada FUR (solo tiene sentido cuando esta APROBADO). */
export async function avancePorRequerimiento(
  sql: AlmacenSql,
  idsRequerimiento: number[],
  tx?: Tx,
): Promise<Map<number, AvanceRequerimiento>> {
  const result = new Map<number, AvanceRequerimiento>();
  if (idsRequerimiento.length === 0) return result;
  const q = sqlTag(sql);
  const rows = await q.rows<{ id: number; lineas: number; completas: number; con_oc: number }>(
    { id: I, lineas: I, completas: I, con_oc: I },
    tx,
  )`
    SELECT d.id_requerimiento AS id,
           count(*) FILTER (WHERE COALESCE(d.cantidad_aprobada, 0) > 0)::int AS lineas,
           count(*) FILTER (WHERE COALESCE(d.cantidad_aprobada, 0) > 0
                              AND COALESCE(o.ordenado, 0) >= d.cantidad_aprobada)::int AS completas,
           count(*) FILTER (WHERE COALESCE(o.ordenado, 0) > 0)::int AS con_oc
      FROM requerimiento_detalle d
      LEFT JOIN (
        SELECT id_requerimiento_detalle AS id, SUM("Cantidad") AS ordenado
          FROM "ordenCompraDetalle" WHERE id_requerimiento_detalle IS NOT NULL
         GROUP BY id_requerimiento_detalle
      ) o ON o.id = d.id
     WHERE d.id_requerimiento = ANY(string_to_array(${csv(idsRequerimiento)}::text, ',')::int[])
     GROUP BY d.id_requerimiento`;
  for (const r of rows) {
    result.set(r.id, r.con_oc === 0 ? 'SIN_ATENDER' : r.lineas > 0 && r.completas === r.lineas ? 'ATENDIDO' : 'PARCIAL');
  }
  for (const id of idsRequerimiento) if (!result.has(id)) result.set(id, 'SIN_ATENDER');
  return result;
}

export interface LineaRequerimientoBloqueada {
  id: number;
  id_requerimiento: number;
  id_producto: number;
  aprobada: string;
  ordenado: string;
  /** `true` si `solicitada` cabe en el saldo (aprobada - ordenado por otras OC). */
  cabe: boolean;
}

/**
 * Valida una cantidad contra el saldo de una linea de FUR. Quien llama debe haber bloqueado la cabecera
 * (`FOR UPDATE`) en la misma transaccion para que no haya dos OC consumiendo el mismo saldo a la vez.
 */
export async function validarConsumoLinea(
  sql: AlmacenSql,
  tx: Tx,
  idDetalle: number,
  solicitada: string,
  excluirOc: number,
): Promise<LineaRequerimientoBloqueada | null> {
  const q = sqlTag(sql);
  const [row] = await q.rows<{ id: number; id_requerimiento: number; id_producto: number; aprobada: string; ordenado: string; cabe: boolean }>(
    { id: I, id_requerimiento: I, id_producto: I, aprobada: T, ordenado: T, cabe: { codecId: 'pg/bool@1', nullable: false } },
    tx,
  )`
    SELECT d.id, d.id_requerimiento, d.id_producto, COALESCE(d.cantidad_aprobada, 0)::text AS aprobada,
           COALESCE(o.ordenado, 0)::text AS ordenado,
           (${solicitada}::numeric <= COALESCE(d.cantidad_aprobada, 0) - COALESCE(o.ordenado, 0)) AS cabe
      FROM requerimiento_detalle d
      LEFT JOIN (
        SELECT SUM("Cantidad") AS ordenado FROM "ordenCompraDetalle"
         WHERE id_requerimiento_detalle = ${idDetalle}::int
           AND (${excluirOc}::int = 0 OR id_orden_compra IS DISTINCT FROM ${excluirOc}::int)
      ) o ON true
     WHERE d.id = ${idDetalle}::int`;
  return row ?? null;
}
