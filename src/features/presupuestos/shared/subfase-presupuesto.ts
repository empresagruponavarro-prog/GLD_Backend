import { BadRequestException } from '@nestjs/common';
import { AlmacenSql, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { situacionPresupuestoObra } from '../../operaciones-obra/shared/presupuesto-aprobado.js';

/**
 * Subfase = categoría de un presupuesto aprobado (`ppto_DetalleFasesCate`). Las compras (FUR, OC/OS) y las salidas de
 * almacén (PECOSA) la llevan por línea para imputar el gasto a la partida del presupuesto Meta (GRP S-09).
 */

/**
 * Comprueba que cada subfase exista y pertenezca a un presupuesto **aprobado** (y no anulado) del centro de costo.
 * Lanza 400 con el motivo; los ids repetidos se validan una sola vez.
 */
export async function validarSubfases(sql: AlmacenSql, tx: Tx | undefined, idCentroCosto: number, ids: readonly number[]): Promise<void> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return;
  const q = sqlTag(sql);
  const filas = await q.rows<{ id: number; id_cc: number | null; estado: string | null }>(
    { id: { codecId: 'pg/int4@1', nullable: false }, id_cc: { codecId: 'pg/int4@1', nullable: true }, estado: TN },
    tx,
  )`
    SELECT c.id, p.id_centro_costo AS id_cc, p.estado_ppto::text AS estado
      FROM "ppto_DetalleFasesCate" c
      LEFT JOIN "ppto_Principal" p ON p."IdPresupuesto" = c."IdPresupuesto"
     WHERE c.id = ANY(string_to_array(${csv(unicos)}::text, ',')::int[])`;
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const id of unicos) {
    const f = porId.get(id);
    if (!f) throw new BadRequestException(`La subfase ${id} no existe`);
    if (f.id_cc !== idCentroCosto) throw new BadRequestException(`La subfase ${id} no pertenece al presupuesto de este centro de costo`);
    if (!['APROBADO', 'ENTREGADO', 'LIQUIDADO'].includes(f.estado ?? '')) {
      throw new BadRequestException(`La subfase ${id} pertenece a un presupuesto que no está aprobado`);
    }
  }
}

/** ¿El centro de costo tiene un presupuesto Principal aprobado? Con él, imputar a una subfase pasa a ser obligatorio. */
export async function centroTienePrincipalAprobado(sql: AlmacenSql, tx: Tx | undefined, idCentroCosto: number): Promise<boolean> {
  const q = sqlTag(sql);
  const filas = await q.rows<{ tipo: string | null; concepto: string | null; estado: string }>({ tipo: TN, concepto: TN, estado: T }, tx)`
    SELECT "TipoPpto"::text AS tipo, "Concepto"::text AS concepto, estado_ppto::text AS estado
      FROM "ppto_Principal" WHERE id_centro_costo = ${idCentroCosto}::int`;
  return situacionPresupuestoObra(filas.map((f) => ({ tipoPpto: f.tipo, concepto: f.concepto, estado: f.estado }))) === 'APROBADO';
}
