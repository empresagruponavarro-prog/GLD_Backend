#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/972708ced59871a2f0ef16c8f5c29eb1c36d2bc03a8e1b2739278b6b7c523ceb/contract';
import startContract from '../../snapshots/972708ced59871a2f0ef16c8f5c29eb1c36d2bc03a8e1b2739278b6b7c523ceb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e84396578ce13b50b58808129c268bfc1f55607bc6f5a515b90ff8767f7b586d/contract';
import endContract from '../../snapshots/e84396578ce13b50b58808129c268bfc1f55607bc6f5a515b90ff8767f7b586d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ordenCompra',
        column: col('id_anexo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      // Copia el id del anexo a traves del codigo. Los codigos que no existen en
      // "anexos" no se referencian: quedan en NULL y se descartan al eliminar "CodigoAnexo".
      rawSql({
        id: 'data.ordenCompra.backfill-id-anexo',
        label: 'Backfill ordenCompra.id_anexo',
        summary: 'Copia ordenCompra.id_anexo desde anexos.id usando CodigoAnexo = anexos.Anexo',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: 'id_anexo',
            table: 'ordenCompra',
          },
        },
        precheck: [
          {
            description: 'ensure rows pending id_anexo backfill',
            sql: [
              'SELECT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ordenCompra" oc',
              '  JOIN "public"."anexos" a ON a."Anexo" = oc."CodigoAnexo"',
              '  WHERE oc.id_anexo IS DISTINCT FROM a.id',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'copy anexo id into ordenCompra.id_anexo',
            sql: [
              'UPDATE "public"."ordenCompra" oc',
              'SET id_anexo = a.id',
              'FROM "public"."anexos" a',
              'WHERE a."Anexo" = oc."CodigoAnexo"',
              '  AND oc.id_anexo IS DISTINCT FROM a.id',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify no rows pending id_anexo backfill',
            sql: [
              'SELECT NOT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ordenCompra" oc',
              '  JOIN "public"."anexos" a ON a."Anexo" = oc."CodigoAnexo"',
              '  WHERE oc.id_anexo IS DISTINCT FROM a.id',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
      }),
      this.dropColumn({ schema: 'public', table: 'ordenCompra', column: 'CodigoAnexo' }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompra',
        index: 'ordenCompra_id_anexo_idx_726d2e48',
        columns: ['id_anexo'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompra',
        foreignKey: {
          name: 'ordenCompra_id_anexo_fkey',
          columns: ['id_anexo'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
