import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AlmacenSql, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';

/**
 * Lecturas de SQL que comparten las cotizaciones y la adjudicación del presupuesto Meta (plan 09).
 * Fase = `ppto_DetalleFases` (la del presupuesto); subfase = `ppto_DetalleFasesCate`; ítem = `ppto_DetalleItems`.
 */

export interface PresupuestoBloqueado {
  id: number;
  /** `ppto_Principal.IdPresupuesto` (PPTO-AAAA-NNN): llave de las fases y los ítems. */
  codigo: string;
  estado: string;
  id_centro_costo: number | null;
}

/** Bloquea el presupuesto (`FOR UPDATE`): serializa cotizaciones, adjudicaciones y la conciliación de compromisos. */
export async function bloquearPresupuesto(sql: AlmacenSql, tx: Tx, id: number): Promise<PresupuestoBloqueado> {
  const q = sqlTag(sql);
  const [p] = await q.rows<PresupuestoBloqueado>({ id: I, codigo: T, estado: T, id_centro_costo: IN }, tx)`
    SELECT id, COALESCE("IdPresupuesto", '')::text AS codigo, estado_ppto::text AS estado, id_centro_costo
      FROM "ppto_Principal" WHERE id = ${id}::int FOR UPDATE`;
  if (!p) throw new NotFoundException(`Presupuesto ${id} no encontrado`);
  if (!p.codigo) throw new BadRequestException('El presupuesto no tiene un código IdPresupuesto válido');
  return p;
}

/** Bloquea el presupuesto por su código `IdPresupuesto`; `null` si no hay (partidas sueltas, datos antiguos). */
export async function bloquearPresupuestoPorCodigo(sql: AlmacenSql, tx: Tx, codigo: string): Promise<PresupuestoBloqueado | null> {
  const q = sqlTag(sql);
  const [p] = await q.rows<PresupuestoBloqueado>({ id: I, codigo: T, estado: T, id_centro_costo: IN }, tx)`
    SELECT id, "IdPresupuesto"::text AS codigo, estado_ppto::text AS estado, id_centro_costo
      FROM "ppto_Principal" WHERE "IdPresupuesto" = ${codigo}::text ORDER BY id LIMIT 1 FOR UPDATE`;
  return p ?? null;
}

/** Lo mismo sin bloquear (lecturas). */
export async function leerPresupuesto(sql: AlmacenSql, id: number): Promise<PresupuestoBloqueado> {
  const q = sqlTag(sql);
  const [p] = await q.rows<PresupuestoBloqueado>({ id: I, codigo: T, estado: T, id_centro_costo: IN })`
    SELECT id, COALESCE("IdPresupuesto", '')::text AS codigo, estado_ppto::text AS estado, id_centro_costo
      FROM "ppto_Principal" WHERE id = ${id}::int`;
  if (!p) throw new NotFoundException(`Presupuesto ${id} no encontrado`);
  return p;
}

/** Ítems con cantidad que todavía no tienen un proveedor ganador (el presupuesto no se aprueba mientras haya alguno). */
export async function itemsSinAdjudicar(sql: AlmacenSql, codigoPpto: string, tx?: Tx): Promise<Array<{ id: number; codigo: string }>> {
  const q = sqlTag(sql);
  return q.rows<{ id: number; codigo: string }>({ id: I, codigo: T }, tx)`
    SELECT i.id, p.codigo::text AS codigo
      FROM "ppto_DetalleItems" i JOIN producto p ON p.id = i.id_producto
     WHERE i."IdPresupuesto" = ${codigoPpto}::text AND i."Cantidad" > 0 AND i.id_ppto_cot_detalle_ganadora IS NULL
     ORDER BY i.id`;
}

export interface FasePresupuesto {
  id: number;
  nombre: string;
}

/** La fase debe ser del presupuesto: 400 si no existe o es de otro. */
export async function fasePresupuesto(sql: AlmacenSql, codigoPpto: string, idFase: number, tx?: Tx): Promise<FasePresupuesto> {
  const q = sqlTag(sql);
  const [f] = await q.rows<FasePresupuesto>({ id: I, nombre: T }, tx)`
    SELECT f.id, COALESCE(m."FaseProyecto", f."IdpptoFase", 'Fase #' || f.id::text)::text AS nombre
      FROM "ppto_DetalleFases" f
      LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = f."IdpptoFase"
     WHERE f.id = ${idFase}::int AND f."IdPresupuesto" = ${codigoPpto}::text`;
  if (!f) throw new BadRequestException(`La fase ${idFase} no pertenece al presupuesto ${codigoPpto}`);
  return f;
}

export interface ItemDeFase {
  id: number;
  /** Número de ítem (`Item`) si lo tiene. */
  numero: string | null;
  id_subfase: number;
  subfase: string;
  id_producto: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  tipo_producto: string;
  cantidad: string;
  /** Precio unitario **Meta** efectivo (plan 11): el propio del ítem o, si no tiene, el Base. */
  costo_unitario: string;
  /** Total **Meta** del ítem (plan 11): el peso con el que se reparte el total de una cotización. */
  costo_total: string;
  id_cot_detalle_ganadora: number | null;
  adjudicado_por: string | null;
  fecha_adjudicacion: string | null;
  comentario_adjudicacion: string | null;
}

const ITEM_SPEC = {
  id: I,
  numero: TN,
  id_subfase: I,
  subfase: T,
  id_producto: I,
  codigo: T,
  descripcion: T,
  unidad: T,
  tipo_producto: T,
  cantidad: T,
  costo_unitario: T,
  costo_total: T,
  id_cot_detalle_ganadora: IN,
  adjudicado_por: TN,
  fecha_adjudicacion: TN,
  comentario_adjudicacion: TN,
} as const;

/** Ítems de una fase del presupuesto (con producto, subfase y ganador actual), en el orden del presupuesto. */
export async function itemsDeFase(sql: AlmacenSql, codigoPpto: string, idFase: number, tx?: Tx): Promise<ItemDeFase[]> {
  const q = sqlTag(sql);
  return q.rows<ItemDeFase>(ITEM_SPEC, tx)`
    SELECT i.id, i."Item"::text AS numero, c.id AS id_subfase,
           COALESCE((SELECT fc."Descripcion" FROM "ppto_FasesCategorias" fc WHERE fc."IdpptoFaseCategoria" = c."IdpptoFaseCategoria" LIMIT 1),
                    'Subfase #' || c.id::text)::text AS subfase,
           i.id_producto, p.codigo::text AS codigo, p.descripcion::text AS descripcion, COALESCE(u.simbolo, u.codigo)::text AS unidad,
           p.tipo_producto::text AS tipo_producto, i."Cantidad"::text AS cantidad, COALESCE(i."CostoUnitarioMeta", i."CostoUnitario")::text AS costo_unitario,
           i."CostoTotalMeta"::text AS costo_total, i.id_ppto_cot_detalle_ganadora AS id_cot_detalle_ganadora,
           i.adjudicado_por::text AS adjudicado_por, i.fecha_adjudicacion::text AS fecha_adjudicacion,
           i.comentario_adjudicacion
      FROM "ppto_DetalleItems" i
      JOIN "ppto_DetalleFasesCate" c ON c.id = i.id_detalle_categoria
      JOIN "ppto_DetalleFases" f ON f."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
      JOIN producto p ON p.id = i.id_producto
      JOIN unidad_medida u ON u.id = i.id_unidad_medida
     WHERE f.id = ${idFase}::int AND f."IdPresupuesto" = ${codigoPpto}::text AND i."IdPresupuesto" = ${codigoPpto}::text
     ORDER BY c.id, i."Orden", i.id`;
}

export interface SubpartidaPresupuesto {
  /** `ppto_DetalleFasesCate.id`. */
  id: number;
  nombre: string;
  /** `ppto_DetalleFases.id` de la fase a la que pertenece. */
  id_detalle_fase: number;
  fase: string;
}

/** La subpartida (`ppto_DetalleFasesCate`) debe ser del presupuesto: 400 si no existe o es de otro. */
export async function subpartidaPresupuesto(sql: AlmacenSql, codigoPpto: string, idSubpartida: number, tx?: Tx): Promise<SubpartidaPresupuesto> {
  const q = sqlTag(sql);
  const [s] = await q.rows<SubpartidaPresupuesto>({ id: I, nombre: T, id_detalle_fase: I, fase: T }, tx)`
    SELECT c.id,
           COALESCE((SELECT fc."Descripcion" FROM "ppto_FasesCategorias" fc WHERE fc."IdpptoFaseCategoria" = c."IdpptoFaseCategoria" LIMIT 1),
                    'Subpartida #' || c.id::text)::text AS nombre,
           f.id AS id_detalle_fase,
           COALESCE(m."FaseProyecto", f."IdpptoFase", 'Fase #' || f.id::text)::text AS fase
      FROM "ppto_DetalleFasesCate" c
      JOIN "ppto_DetalleFases" f ON f."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
      LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = f."IdpptoFase"
     WHERE c.id = ${idSubpartida}::int AND c."IdPresupuesto" = ${codigoPpto}::text AND f."IdPresupuesto" = ${codigoPpto}::text`;
  if (!s) throw new BadRequestException(`La subpartida ${idSubpartida} no pertenece al presupuesto ${codigoPpto}`);
  return s;
}

/** Ítems de una subpartida del presupuesto (con producto y ganador actual), en el orden del presupuesto. */
export async function itemsDeSubpartida(sql: AlmacenSql, codigoPpto: string, idSubpartida: number, tx?: Tx): Promise<ItemDeFase[]> {
  const q = sqlTag(sql);
  return q.rows<ItemDeFase>(ITEM_SPEC, tx)`
    SELECT i.id, i."Item"::text AS numero, c.id AS id_subfase,
           COALESCE((SELECT fc."Descripcion" FROM "ppto_FasesCategorias" fc WHERE fc."IdpptoFaseCategoria" = c."IdpptoFaseCategoria" LIMIT 1),
                    'Subfase #' || c.id::text)::text AS subfase,
           i.id_producto, p.codigo::text AS codigo, p.descripcion::text AS descripcion, COALESCE(u.simbolo, u.codigo)::text AS unidad,
           p.tipo_producto::text AS tipo_producto, i."Cantidad"::text AS cantidad, COALESCE(i."CostoUnitarioMeta", i."CostoUnitario")::text AS costo_unitario,
           i."CostoTotalMeta"::text AS costo_total, i.id_ppto_cot_detalle_ganadora AS id_cot_detalle_ganadora,
           i.adjudicado_por::text AS adjudicado_por, i.fecha_adjudicacion::text AS fecha_adjudicacion,
           i.comentario_adjudicacion
      FROM "ppto_DetalleItems" i
      JOIN "ppto_DetalleFasesCate" c ON c.id = i.id_detalle_categoria
      JOIN producto p ON p.id = i.id_producto
      JOIN unidad_medida u ON u.id = i.id_unidad_medida
     WHERE c.id = ${idSubpartida}::int AND c."IdPresupuesto" = ${codigoPpto}::text AND i."IdPresupuesto" = ${codigoPpto}::text
     ORDER BY i."Orden", i.id`;
}

/** FUR y documento que ya nacieron de un ítem. */
export interface CompromisoItem {
  id_ppto_item: number;
  id_requerimiento: number;
  numero_requerimiento: string;
  estado_requerimiento: string;
  id_documento: number | null;
  numero_documento: string | null;
  estado_documento: string | null;
}

/**
 * Compromisos vigentes de los ítems: la línea del FUR que lo pidió (FUR no anulado ni rechazado) y la OC/OS que la contiene
 * (no anulada). Un ítem está **cubierto** si su documento está `REGISTRADO`.
 */
export async function compromisosDeItems(sql: AlmacenSql, ids: number[], tx?: Tx): Promise<Map<number, CompromisoItem>> {
  const resultado = new Map<number, CompromisoItem>();
  if (ids.length === 0) return resultado;
  const q = sqlTag(sql);
  const filas = await q.rows<CompromisoItem>(
    {
      id_ppto_item: I,
      id_requerimiento: I,
      numero_requerimiento: T,
      estado_requerimiento: T,
      id_documento: IN,
      numero_documento: TN,
      estado_documento: TN,
    },
    tx,
  )`
    SELECT rd.id_ppto_item, r.id AS id_requerimiento, r.numero::text AS numero_requerimiento, r.estado::text AS estado_requerimiento,
           o.id AS id_documento, o.numero_documento::text AS numero_documento, o.estado::text AS estado_documento
      FROM requerimiento_detalle rd
      JOIN requerimiento r ON r.id = rd.id_requerimiento AND r.estado::text NOT IN ('ANULADO', 'RECHAZADO')
      LEFT JOIN LATERAL (
        SELECT d.id, d.numero_documento, d.estado
          FROM "ordenCompraDetalle" od JOIN "documentosOrigen" d ON d.id = od.id_orden_compra
         WHERE od.id_requerimiento_detalle = rd.id AND d.estado::text <> 'ANULADO'
         ORDER BY d.id DESC LIMIT 1
      ) o ON true
     WHERE rd.id_ppto_item = ANY(string_to_array(${csv(ids)}::text, ',')::int[])
     ORDER BY rd.id`;
  for (const f of filas) resultado.set(f.id_ppto_item, f);
  return resultado;
}

/** Ítem con una orden de compra o de servicio registrada (vigente): no cambia de proveedor ni se edita su cotización. */
export function estaCubierto(c: CompromisoItem | undefined): boolean {
  return c?.estado_documento === 'REGISTRADO';
}
