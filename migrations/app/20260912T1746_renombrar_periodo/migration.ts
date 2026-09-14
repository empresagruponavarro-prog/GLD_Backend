#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8c4a3c6b9e3f579a0d0d0bbaccaf0e303321a429aef9fa29d2979ecb2f37ce53/contract';
import startContract from '../../snapshots/8c4a3c6b9e3f579a0d0d0bbaccaf0e303321a429aef9fa29d2979ecb2f37ce53/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fc29048f51fc25f9e76102d676db312aef79d6ed99153e297cb181e428d62e93/contract';
import endContract from '../../snapshots/fc29048f51fc25f9e76102d676db312aef79d6ed99153e297cb181e428d62e93/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

const TABLES = ['CentroCostos', 'contrataciones', 'planillaPago', 'ppto_Principal', 'semana'];

function colExistsSql(column: string): string {
  return [
    'SELECT EXISTS (SELECT 1 AS "one" FROM "information_schema"."columns"',
    'WHERE ("table_schema" = $1 AND "table_name" = $2 AND "column_name" = $3)) AS "result"',
  ].join(' ');
}

function colNotExistsSql(column: string): string {
  return [
    'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "information_schema"."columns"',
    'WHERE ("table_schema" = $1 AND "table_name" = $2 AND "column_name" = $3)) AS "result"',
  ].join(' ');
}

function tableExistsSql(table: string): string {
  return [
    'SELECT EXISTS (SELECT 1 AS "one" FROM "information_schema"."tables"',
    'WHERE ("table_schema" = $1 AND "table_name" = $2)) AS "result"',
  ].join(' ');
}

function tableNotExistsSql(table: string): string {
  return [
    'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "information_schema"."tables"',
    'WHERE ("table_schema" = $1 AND "table_name" = $2)) AS "result"',
  ].join(' ');
}

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Renombra "IdPeriodo" (varchar) a "periodo" (int4) en cada tabla, preservando datos.
      ...TABLES.map((table) =>
        rawSql({
          id: `column.public.${table}.periodo`,
          label: `Rename column "IdPeriodo" to "periodo" on "${table}"`,
          summary: `Renames column "IdPeriodo" to "periodo" on "${table}"`,
          operationClass: 'additive',
          target: {
            id: 'postgres',
            details: { schema: 'public', objectType: 'column', name: 'periodo', table },
          },
          precheck: [
            {
              description: `ensure column "periodo" is missing`,
              sql: colNotExistsSql('periodo'),
              params: ['public', table, 'periodo'],
            },
          ],
          execute: [
            {
              description: `rename column "IdPeriodo" to "periodo"`,
              sql: `ALTER TABLE "public"."${table}" RENAME COLUMN "IdPeriodo" TO "periodo"`,
              params: [],
            },
            {
              description: `cast column "periodo" to int4`,
              sql: `ALTER TABLE "public"."${table}" ALTER COLUMN "periodo" TYPE int4 USING ("periodo"::int4)`,
              params: [],
            },
          ],
          postcheck: [
            {
              description: `verify column "periodo" exists`,
              sql: colExistsSql('periodo'),
              params: ['public', table, 'periodo'],
            },
          ],
        }),
      ),

      // Elimina la tabla "periodos", que no se usa.
      rawSql({
        id: 'table.public.periodos',
        label: 'Drop table "periodos"',
        summary: 'Drops table "periodos"',
        operationClass: 'destructive',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'table', name: 'periodos' },
        },
        precheck: [
          {
            description: `ensure table "periodos" exists`,
            sql: tableExistsSql('periodos'),
            params: ['public', 'periodos'],
          },
        ],
        execute: [
          {
            description: `drop table "periodos"`,
            sql: `DROP TABLE "public"."periodos"`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: `verify table "periodos" is gone`,
            sql: tableNotExistsSql('periodos'),
            params: ['public', 'periodos'],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);