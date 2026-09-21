#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/9c22b66ca727f927e26c72ec6831252d532092e662ff4c418bf0c2930d1b0080/contract';
import startContract from '../../snapshots/9c22b66ca727f927e26c72ec6831252d532092e662ff4c418bf0c2930d1b0080/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c6b48f2dda32c46d4a3b335d5d5521865e12cfedaab2cf83d025fb8bc1a8fcb4/contract';
import endContract from '../../snapshots/c6b48f2dda32c46d4a3b335d5d5521865e12cfedaab2cf83d025fb8bc1a8fcb4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  // Prisma no detecta renames de tabla: el planner propone DROP + CREATE (destructivo).
  // Se reescribe como ALTER TABLE ... RENAME conservando filas, y se renombran secuencia,
  // primary key, foreign keys e indices para que coincidan con los nombres del contrato.
  override get operations() {
    return [
      rawSql({
        id: 'rename.ordenCompra.documentosOrigen',
        label: 'Rename table "ordenCompra" to "documentosOrigen"',
        summary: 'Renombra la tabla ordenCompra a documentosOrigen conservando los datos y las relaciones',
        operationClass: 'widening',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'table',
            name: 'documentosOrigen',
          },
        },
        precheck: [
          {
            description: 'ensure "documentosOrigen" does not exist and "ordenCompra" does',
            sql: [
              "SELECT (to_regclass('\"public\".\"ordenCompra\"') IS NOT NULL",
              "  AND to_regclass('\"public\".\"documentosOrigen\"') IS NULL) AS \"result\"",
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'rename table "ordenCompra" to "documentosOrigen"',
            sql: 'ALTER TABLE "public"."ordenCompra" RENAME TO "documentosOrigen"',
            params: [],
          },
          {
            description: 'rename sequence "ordenCompra_id_seq"',
            sql: 'ALTER SEQUENCE "public"."ordenCompra_id_seq" RENAME TO "documentosOrigen_id_seq"',
            params: [],
          },
          {
            description: 'rename primary key "ordenCompra_pkey"',
            sql: 'ALTER TABLE "public"."documentosOrigen" RENAME CONSTRAINT "ordenCompra_pkey" TO "documentosOrigen_pkey"',
            params: [],
          },
          {
            description: 'rename foreign key "ordenCompra_id_centro_costo_fkey"',
            sql: 'ALTER TABLE "public"."documentosOrigen" RENAME CONSTRAINT "ordenCompra_id_centro_costo_fkey" TO "documentosOrigen_id_centro_costo_fkey"',
            params: [],
          },
          {
            description: 'rename foreign key "ordenCompra_id_detalle_fase_categoria_fkey"',
            sql: 'ALTER TABLE "public"."documentosOrigen" RENAME CONSTRAINT "ordenCompra_id_detalle_fase_categoria_fkey" TO "documentosOrigen_id_detalle_fase_categoria_fkey"',
            params: [],
          },
          {
            description: 'rename foreign key "ordenCompra_id_categoria_fkey"',
            sql: 'ALTER TABLE "public"."documentosOrigen" RENAME CONSTRAINT "ordenCompra_id_categoria_fkey" TO "documentosOrigen_id_categoria_fkey"',
            params: [],
          },
          {
            description: 'rename foreign key "ordenCompra_id_anexo_fkey"',
            sql: 'ALTER TABLE "public"."documentosOrigen" RENAME CONSTRAINT "ordenCompra_id_anexo_fkey" TO "documentosOrigen_id_anexo_fkey"',
            params: [],
          },
          {
            description: 'rename index "ordenCompra_id_centro_costo_idx_8c84570b"',
            sql: 'ALTER INDEX "public"."ordenCompra_id_centro_costo_idx_8c84570b" RENAME TO "documentosOrigen_id_centro_costo_idx_8c84570b"',
            params: [],
          },
          {
            description: 'rename index "ordenCompra_id_categoria_idx_dc879264"',
            sql: 'ALTER INDEX "public"."ordenCompra_id_categoria_idx_dc879264" RENAME TO "documentosOrigen_id_categoria_idx_dc879264"',
            params: [],
          },
          {
            description: 'rename index "ordenCompra_id_anexo_idx_726d2e48"',
            sql: 'ALTER INDEX "public"."ordenCompra_id_anexo_idx_726d2e48" RENAME TO "documentosOrigen_id_anexo_idx_726d2e48"',
            params: [],
          },
          {
            description: 'rename index "ordenCompra_id_detalle_fase_categoria_idx_c1fc72ce"',
            sql: 'ALTER INDEX "public"."ordenCompra_id_detalle_fase_categoria_idx_c1fc72ce" RENAME TO "documentosOrigen_id_detalle_fase_categoria_idx_c1fc72ce"',
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify "documentosOrigen" exists and "ordenCompra" does not',
            sql: [
              "SELECT (to_regclass('\"public\".\"documentosOrigen\"') IS NOT NULL",
              "  AND to_regclass('\"public\".\"ordenCompra\"') IS NULL) AS \"result\"",
            ].join(' '),
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
