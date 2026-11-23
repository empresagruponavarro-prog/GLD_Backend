#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4ada217dde77de1c97fc3f38b647aa59c886e577f9d6fa7954ae829842fa2fc9/contract';
import endContract from '../../snapshots/4ada217dde77de1c97fc3f38b647aa59c886e577f9d6fa7954ae829842fa2fc9/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/95d8dd49b8d938e3f1d287c0f3d601c004a4b00ba545824b578b5e45d9bf089a/contract';
import startContract from '../../snapshots/95d8dd49b8d938e3f1d287c0f3d601c004a4b00ba545824b578b5e45d9bf089a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Plan 11 · F0 — Presupuesto Base y Presupuesto Meta. Agrega las columnas del Meta y deja los presupuestos que ya existen con
 * Meta = Base (el backfill va en este mismo paquete, después de agregar las columnas, para que toda BD que llegue a este contrato lo reciba):
 *  - Ítems sin precio Meta propio: `CostoTotalMeta = CostoTotal` (con `CostoUnitarioMeta` NULL el Meta efectivo es el Base).
 *  - Subfases con ítems: `CostoDirectoMeta = Σ CostoTotalMeta` de sus ítems (con ítems, la subfase es la suma de ellos).
 *  - Subfases sin ítems, fases y presupuestos: quedan en NULL (= Base). No se suma hacia arriba a propósito: algunos totales ya
 *    guardados no coinciden con la suma de sus hijos, y sumarlos cambiaría su valor; el recálculo (`recalcular-meta.ts`) los
 *    normaliza en la primera edición.
 * Solo toca filas con el Meta sin definir, así que es idempotente.
 */
const ITEMS_SIN_META = `SELECT 1 FROM "public"."ppto_DetalleItems"
   WHERE "CostoUnitarioMeta" IS NULL AND "CostoTotalMeta" IS DISTINCT FROM "CostoTotal"`;

const SUBFASES_CON_ITEMS_SIN_META = `SELECT 1 FROM "public"."ppto_DetalleFasesCate" c
   WHERE c."CostoDirectoMeta" IS NULL
     AND EXISTS (SELECT 1 FROM "public"."ppto_DetalleItems" i WHERE i."id_detalle_categoria" = c."id")`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleFases',
        column: col('CostoDirectoMeta', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        column: col('CostoDirectoMeta', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleItems',
        column: col('CostoTotalMeta', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleItems',
        column: col('CostoUnitarioMeta', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Principal',
        column: col('CostoDirectoMeta', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      rawSql({
        id: 'data.presupuesto-meta.meta-igual-al-base',
        label: 'Deja el Meta de los presupuestos existentes igual a su Base',
        summary: 'ppto_DetalleItems.CostoTotalMeta y ppto_DetalleFasesCate.CostoDirectoMeta (subfases con ítems)',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'ppto_DetalleItems' } },
        precheck: [],
        execute: [
          {
            description: 'ítems sin precio Meta propio: su total Meta es el total Base',
            sql: `UPDATE "public"."ppto_DetalleItems"
                     SET "CostoTotalMeta" = "CostoTotal"
                   WHERE "CostoUnitarioMeta" IS NULL AND "CostoTotalMeta" IS DISTINCT FROM "CostoTotal"`,
            params: [],
          },
          {
            description: 'subfases con ítems: su Meta es la suma del Meta de sus ítems',
            sql: `UPDATE "public"."ppto_DetalleFasesCate" c
                     SET "CostoDirectoMeta" = s."total"
                    FROM (
                      SELECT "id_detalle_categoria" AS "id", sum("CostoTotalMeta") AS "total"
                        FROM "public"."ppto_DetalleItems"
                       GROUP BY "id_detalle_categoria"
                    ) s
                   WHERE c."id" = s."id" AND c."CostoDirectoMeta" IS NULL`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'ningún ítem sin precio Meta propio queda con un total Meta distinto del Base',
            sql: `SELECT NOT EXISTS (${ITEMS_SIN_META}) AS "result"`,
            params: [],
          },
          {
            description: 'ninguna subfase con ítems queda sin su Meta',
            sql: `SELECT NOT EXISTS (${SUBFASES_CON_ITEMS_SIN_META}) AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
