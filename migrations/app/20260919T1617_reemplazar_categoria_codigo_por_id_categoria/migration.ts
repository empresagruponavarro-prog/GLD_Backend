#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/029a653983b1de65309c43fa0fec81d4a5d1bb9ccd8b5adca3752adb9270964c/contract';
import startContract from '../../snapshots/029a653983b1de65309c43fa0fec81d4a5d1bb9ccd8b5adca3752adb9270964c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/972708ced59871a2f0ef16c8f5c29eb1c36d2bc03a8e1b2739278b6b7c523ceb/contract';
import endContract from '../../snapshots/972708ced59871a2f0ef16c8f5c29eb1c36d2bc03a8e1b2739278b6b7c523ceb/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ordenCompra',
        column: col('id_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      // Conserva la categoria de cada OC copiando categoria.id a traves del codigo
      // antes de eliminar "CategoriaCodigo". Todas las OC tienen su codigo en "categoria".
      rawSql({
        id: 'data.ordenCompra.backfill-id-categoria',
        label: 'Backfill ordenCompra.id_categoria',
        summary:
          'Copia ordenCompra.id_categoria desde categoria.id usando CategoriaCodigo = categoria.codigo',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: 'id_categoria',
            table: 'ordenCompra',
          },
        },
        precheck: [
          {
            description: 'ensure rows pending id_categoria backfill',
            sql: [
              'SELECT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ordenCompra" oc',
              '  JOIN "public"."categoria" c ON c.codigo = oc."CategoriaCodigo"',
              '  WHERE oc.id_categoria IS DISTINCT FROM c.id',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'copy categoria id into ordenCompra.id_categoria',
            sql: [
              'UPDATE "public"."ordenCompra" oc',
              'SET id_categoria = c.id',
              'FROM "public"."categoria" c',
              'WHERE c.codigo = oc."CategoriaCodigo"',
              '  AND oc.id_categoria IS DISTINCT FROM c.id',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify no rows pending id_categoria backfill',
            sql: [
              'SELECT NOT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ordenCompra" oc',
              '  JOIN "public"."categoria" c ON c.codigo = oc."CategoriaCodigo"',
              '  WHERE oc.id_categoria IS DISTINCT FROM c.id',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'ordenCompra',
        constraint: 'ordenCompra_CategoriaCodigo_fkey',
        kind: 'foreignKey',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'ordenCompra',
        index: 'ordenCompra_CategoriaCodigo_idx_2b1c916f',
      }),
      this.dropColumn({ schema: 'public', table: 'ordenCompra', column: 'CategoriaCodigo' }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompra',
        index: 'ordenCompra_id_categoria_idx_dc879264',
        columns: ['id_categoria'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompra',
        foreignKey: {
          name: 'ordenCompra_id_categoria_fkey',
          columns: ['id_categoria'],
          references: { schema: 'public', table: 'categoria', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
