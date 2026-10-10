import { AlmacenSql, B, I, T, sqlTag, type Tx } from './almacen-sql.js';

export type EstadoRecepcion = 'PENDIENTE' | 'PARCIAL' | 'RECIBIDA' | 'SIN_BIENES';

/** Lista de ids como CSV para `= ANY(string_to_array(...))` (evita depender de la codificacion de arrays). */
export function csv(ids: number[]): string {
  return [...new Set(ids)].join(',');
}

/** Cantidad recibida (ingresos COMPRA REGISTRADO) por linea de OC. Solo devuelve lineas con recepciones. */
export async function recibidoPorLinea(sql: AlmacenSql, idsOc: number[], tx?: Tx): Promise<Map<number, string>> {
  if (idsOc.length === 0) return new Map();
  const q = sqlTag(sql);
  const rows = await q.rows<{ id: number; recibido: string }>({ id: I, recibido: T }, tx)`
    SELECT dd.id_orden_compra_detalle AS id, SUM(dd.cantidad)::text AS recibido
      FROM almacen_documento_detalle dd
      JOIN almacen_documento a ON a.id = dd.id_documento
      JOIN "ordenCompraDetalle" l ON l.id = dd.id_orden_compra_detalle
     WHERE a.estado = 'REGISTRADO' AND a.naturaleza = 'INGRESO' AND a.motivo = 'COMPRA'
       AND l.id_orden_compra = ANY(string_to_array(${csv(idsOc)}::text, ',')::int[])
     GROUP BY dd.id_orden_compra_detalle`;
  return new Map(rows.map((r) => [r.id, r.recibido]));
}

/** Estado de recepcion por OC (solo cuentan las lineas de PRODUCTO del catalogo). */
export async function estadoRecepcionPorOc(
  sql: AlmacenSql,
  idsOc: number[],
  tx?: Tx,
): Promise<Map<number, EstadoRecepcion>> {
  const result = new Map<number, EstadoRecepcion>();
  if (idsOc.length === 0) return result;
  const q = sqlTag(sql);
  const rows = await q.rows<{ id: number; bienes: number; completas: number; con_recepcion: number }>(
    { id: I, bienes: I, completas: I, con_recepcion: I },
    tx,
  )`
    SELECT l.id_orden_compra AS id,
           count(*)::int AS bienes,
           count(*) FILTER (WHERE COALESCE(r.recibido, 0) >= COALESCE(l."Cantidad", 0))::int AS completas,
           count(*) FILTER (WHERE COALESCE(r.recibido, 0) > 0)::int AS con_recepcion
      FROM "ordenCompraDetalle" l
      JOIN producto p ON p.id = l.id_producto AND p.tipo_producto = 'PRODUCTO'
      LEFT JOIN (
        SELECT dd.id_orden_compra_detalle AS id, SUM(dd.cantidad) AS recibido
          FROM almacen_documento_detalle dd
          JOIN almacen_documento a ON a.id = dd.id_documento
         WHERE a.estado = 'REGISTRADO' AND a.naturaleza = 'INGRESO' AND a.motivo = 'COMPRA'
         GROUP BY dd.id_orden_compra_detalle
      ) r ON r.id = l.id
     WHERE l.id_orden_compra = ANY(string_to_array(${csv(idsOc)}::text, ',')::int[])
     GROUP BY l.id_orden_compra`;
  for (const r of rows) {
    result.set(
      r.id,
      r.bienes === 0 ? 'SIN_BIENES' : r.completas === r.bienes ? 'RECIBIDA' : r.con_recepcion > 0 ? 'PARCIAL' : 'PENDIENTE',
    );
  }
  for (const id of idsOc) if (!result.has(id)) result.set(id, 'SIN_BIENES');
  return result;
}

/** ¿La OC tiene ingresos asociados (de cualquier estado)? Mientras existan, su detalle no se puede reemplazar ni borrar. */
export async function tieneRecepciones(sql: AlmacenSql, idOc: number, tx?: Tx): Promise<boolean> {
  const q = sqlTag(sql);
  const [row] = await q.rows<{ existe: boolean }>({ existe: B }, tx)`
    SELECT EXISTS (SELECT 1 FROM almacen_documento WHERE id_orden_compra = ${idOc}::int) AS existe`;
  return row?.existe ?? false;
}
