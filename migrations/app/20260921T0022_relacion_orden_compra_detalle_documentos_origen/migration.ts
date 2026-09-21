#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/365321126bdf35e1149a365738100ec05c0259baae20d5d67d3e404289a6f95e/contract';
import startContract from '../../snapshots/365321126bdf35e1149a365738100ec05c0259baae20d5d67d3e404289a6f95e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5fc1b590cac19c142654917944bd45645187947d0375edbb66e1ed420c0e1e68/contract';
import endContract from '../../snapshots/5fc1b590cac19c142654917944bd45645187947d0375edbb66e1ed420c0e1e68/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ordenCompraDetalle',
        column: col('id_orden_compra', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      // Vincula cada detalle con su orden de compra (documentosOrigen) usando el
      // codigo compartido "IdOC" = documentosOrigen.id_oc. Las filas sin match
      // (huerfanas) quedan con id_orden_compra NULL.
      rawSql({
        id: 'data.ordenCompraDetalle.backfill-id-orden-compra',
        label: 'Backfill ordenCompraDetalle.id_orden_compra',
        summary:
          'Copia documentosOrigen.id en ordenCompraDetalle.id_orden_compra usando IdOC = documentosOrigen.id_oc',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: 'id_orden_compra',
            table: 'ordenCompraDetalle',
          },
        },
        precheck: [
          {
            description: 'ensure rows pending id_orden_compra backfill',
            sql: [
              'SELECT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ordenCompraDetalle" d',
              '  WHERE d."IdOC" IS NOT NULL AND btrim(d."IdOC") <> \'\'',
              '    AND EXISTS (SELECT 1 FROM "public"."documentosOrigen" oc WHERE oc.id_oc = d."IdOC")',
              '    AND d.id_orden_compra IS DISTINCT FROM (',
              '      SELECT min(oc.id) FROM "public"."documentosOrigen" oc WHERE oc.id_oc = d."IdOC"',
              '    )',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'copy documentosOrigen id into ordenCompraDetalle.id_orden_compra',
            sql: [
              'UPDATE "public"."ordenCompraDetalle" d',
              'SET id_orden_compra = (',
              '  SELECT min(oc.id) FROM "public"."documentosOrigen" oc WHERE oc.id_oc = d."IdOC"',
              ')',
              'WHERE d."IdOC" IS NOT NULL AND btrim(d."IdOC") <> \'\'',
              '  AND EXISTS (SELECT 1 FROM "public"."documentosOrigen" oc WHERE oc.id_oc = d."IdOC")',
              '  AND d.id_orden_compra IS DISTINCT FROM (',
              '    SELECT min(oc.id) FROM "public"."documentosOrigen" oc WHERE oc.id_oc = d."IdOC"',
              '  )',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify no rows pending id_orden_compra backfill',
            sql: [
              'SELECT NOT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ordenCompraDetalle" d',
              '  WHERE d."IdOC" IS NOT NULL AND btrim(d."IdOC") <> \'\'',
              '    AND EXISTS (SELECT 1 FROM "public"."documentosOrigen" oc WHERE oc.id_oc = d."IdOC")',
              '    AND d.id_orden_compra IS DISTINCT FROM (',
              '      SELECT min(oc.id) FROM "public"."documentosOrigen" oc WHERE oc.id_oc = d."IdOC"',
              '    )',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompraDetalle',
        index: 'ordenCompraDetalle_id_orden_compra_idx_ceb1e2df',
        columns: ['id_orden_compra'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompraDetalle',
        foreignKey: {
          name: 'ordenCompraDetalle_id_orden_compra_fkey',
          columns: ['id_orden_compra'],
          references: { schema: 'public', table: 'documentosOrigen', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
