import { AlmacenSql, I, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';

/**
 * Cobertura de un ítem por las versiones anteriores del presupuesto (plan 09, §3.7). Una nueva versión copia sus ítems con
 * `id_item_origen`; lo que las versiones anteriores ya pidieron con una orden **registrada** (compromiso con un tercero) cuenta como pedido.
 */

/** Lo que la cadena de origen de un ítem ya pidió con órdenes registradas. */
export interface CoberturaItem {
  cantidad: number;
  /** Proveedores (anexos) de esas órdenes. */
  proveedores: number[];
  /** Números de esas órdenes, para los mensajes. */
  documentos: string[];
}

export type ResultadoCobertura =
  | { tipo: 'LIBRE' }
  | { tipo: 'CUBIERTO' }
  /** Mismo proveedor y más cantidad que antes: se pide solo la diferencia. */
  | { tipo: 'DIFERENCIA'; cantidad: number }
  /** El ítem ya se pidió a otro proveedor: hay que anular esa orden o volver al mismo proveedor. */
  | { tipo: 'CONFLICTO' };

const EPS = 0.005;

/**
 * Puro. Decide qué hacer con un ítem adjudicado a `idProveedorGanador` con `cantidad` según lo ya pedido por sus versiones anteriores:
 *  - nada pedido → `LIBRE` (se pide todo);
 *  - pedido a otro proveedor → `CONFLICTO`;
 *  - mismo proveedor y cantidad ≤ lo pedido → `CUBIERTO` (no se genera nada);
 *  - mismo proveedor y más cantidad → `DIFERENCIA` (se pide solo lo que falta).
 */
export function resolverCobertura(cantidad: number, idProveedorGanador: number, cobertura: CoberturaItem | undefined): ResultadoCobertura {
  if (!cobertura || cobertura.cantidad <= EPS) return { tipo: 'LIBRE' };
  if (cobertura.proveedores.some((p) => p !== idProveedorGanador)) return { tipo: 'CONFLICTO' };
  const falta = cantidad - cobertura.cantidad;
  return falta <= EPS ? { tipo: 'CUBIERTO' } : { tipo: 'DIFERENCIA', cantidad: falta };
}

/** Lo ya pedido (órdenes REGISTRADO vigentes) por los ítems de origen de cada ítem del presupuesto. Solo trae los que tienen algo. */
export async function coberturaPorOrigen(sql: AlmacenSql, codigoPpto: string, tx?: Tx): Promise<Map<number, CoberturaItem>> {
  const q = sqlTag(sql);
  const filas = await q.rows<{ id_item: number; cantidad: string; id_anexo: number | null; numero_documento: string | null }>(
    { id_item: I, cantidad: T, id_anexo: { codecId: 'pg/int4@1', nullable: true }, numero_documento: TN },
    tx,
  )`
    WITH RECURSIVE cadena(id_item, ancestro) AS (
      SELECT i.id, i.id_item_origen FROM "ppto_DetalleItems" i
       WHERE i."IdPresupuesto" = ${codigoPpto}::text AND i.id_item_origen IS NOT NULL
      UNION
      SELECT c.id_item, a.id_item_origen FROM cadena c JOIN "ppto_DetalleItems" a ON a.id = c.ancestro
       WHERE a.id_item_origen IS NOT NULL
    )
    SELECT c.id_item, COALESCE(od."Cantidad", 0)::text AS cantidad, d.id_anexo, d.numero_documento::text AS numero_documento
      FROM cadena c
      JOIN requerimiento_detalle rd ON rd.id_ppto_item = c.ancestro
      JOIN requerimiento r ON r.id = rd.id_requerimiento AND r.estado::text NOT IN ('ANULADO', 'RECHAZADO')
      JOIN "ordenCompraDetalle" od ON od.id_requerimiento_detalle = rd.id
      JOIN "documentosOrigen" d ON d.id = od.id_orden_compra AND d.estado::text = 'REGISTRADO'`;
  const mapa = new Map<number, CoberturaItem>();
  for (const f of filas) {
    const c = mapa.get(f.id_item) ?? { cantidad: 0, proveedores: [], documentos: [] };
    c.cantidad += Number(f.cantidad);
    if (f.id_anexo !== null && !c.proveedores.includes(f.id_anexo)) c.proveedores.push(f.id_anexo);
    if (f.numero_documento && !c.documentos.includes(f.numero_documento)) c.documentos.push(f.numero_documento);
    mapa.set(f.id_item, c);
  }
  return mapa;
}

export interface ConflictoVersion {
  id_ppto_item: number;
  codigo: string;
  /** Proveedor que gana el ítem en este presupuesto. */
  id_proveedor_adjudicado: number;
  /** Órdenes registradas de versiones anteriores que ya lo pidieron a otro proveedor. */
  documentos: string[];
}

/** Ítems adjudicados a un proveedor distinto del de una orden registrada que ya los pidió: bloquean la aprobación. */
export async function conflictosPorOrigen(sql: AlmacenSql, codigoPpto: string, tx?: Tx): Promise<ConflictoVersion[]> {
  const cobertura = await coberturaPorOrigen(sql, codigoPpto, tx);
  if (cobertura.size === 0) return [];
  const q = sqlTag(sql);
  const items = await q.rows<{ id: number; codigo: string; cantidad: string; id_proveedor: number }>({ id: I, codigo: T, cantidad: T, id_proveedor: I }, tx)`
    SELECT i.id, p.codigo::text AS codigo, i."Cantidad"::text AS cantidad, g.id_proveedor
      FROM "ppto_DetalleItems" i
      JOIN producto p ON p.id = i.id_producto
      JOIN ppto_cotizacion_detalle d ON d.id = i.id_ppto_cot_detalle_ganadora
      JOIN ppto_cotizacion g ON g.id = d.id_cotizacion
     WHERE i."IdPresupuesto" = ${codigoPpto}::text AND i."Cantidad" > 0 ORDER BY i.id`;
  const conflictos: ConflictoVersion[] = [];
  for (const it of items) {
    const cov = cobertura.get(it.id);
    if (resolverCobertura(Number(it.cantidad), it.id_proveedor, cov).tipo === 'CONFLICTO') {
      conflictos.push({ id_ppto_item: it.id, codigo: it.codigo, id_proveedor_adjudicado: it.id_proveedor, documentos: cov?.documentos ?? [] });
    }
  }
  return conflictos;
}
