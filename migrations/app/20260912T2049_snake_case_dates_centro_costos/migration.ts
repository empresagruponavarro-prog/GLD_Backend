#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8b3e1cec4d5db673b8e875630b9b075ad45b931f528b4608c7e752ba70b7eb04/contract';
import endContract from '../../snapshots/8b3e1cec4d5db673b8e875630b9b075ad45b931f528b4608c7e752ba70b7eb04/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c5d53dc291b196b2457a966e2f110f28d5e776d3cc1d8ff4e9f283cce6b815ab/contract';
import startContract from '../../snapshots/c5d53dc291b196b2457a966e2f110f28d5e776d3cc1d8ff4e9f283cce6b815ab/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

const TABLE = 'CentroCostos';

// Renombres simples que preservan datos (PascalCase -> snake_case).
const SIMPLE_RENAMES: ReadonlyArray<[string, string]> = [
  ['CentroCosto', 'centro_costo'],
  ['CodCliente', 'cod_cliente'],
  ['Estado', 'estado'],
  ['OCFile', 'oc_file'],
  ['PresupuestoCostoDirecto', 'presupuesto_costo_directo'],
  ['PresupuestoEstado', 'presupuesto_estado'],
  ['PresupuestoGastosGenerales', 'presupuesto_gastos_generales'],
  ['PresupuestoMonto', 'presupuesto_monto'],
  ['PresupuestoViaticos', 'presupuesto_viaticos'],
];

// Renombres que además cambian el tipo a date (los datos ya están en ISO YYYY-MM-DD).
const DATE_RENAMES: ReadonlyArray<[string, string]> = [
  ['FechaFinProg', 'fecha_fin_prog'],
  ['FechaFinReal', 'fecha_fin_real'],
  ['FechaIncio', 'fecha_inicio'],
];

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

function constraintExistsSql(constraint: string): string {
  return [
    'SELECT EXISTS (SELECT 1 AS "one" FROM "pg_constraint"',
    'WHERE ("conname" = $1)) AS "result"',
  ].join(' ');
}

function constraintNotExistsSql(constraint: string): string {
  return [
    'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "pg_constraint"',
    'WHERE ("conname" = $1)) AS "result"',
  ].join(' ');
}

function renameColumnOp(oldName: string, newName: string) {
  return rawSql({
    id: `column.public.${TABLE}.${newName}`,
    label: `Rename column "${oldName}" to "${newName}" on "${TABLE}"`,
    summary: `Renames column "${oldName}" to "${newName}" on "${TABLE}"`,
    operationClass: 'additive',
    target: {
      id: 'postgres',
      details: { schema: 'public', objectType: 'column', name: newName, table: TABLE },
    },
    precheck: [
      {
        description: `ensure column "${newName}" is missing`,
        sql: colNotExistsSql(newName),
        params: ['public', TABLE, newName],
      },
    ],
    execute: [
      {
        description: `rename column "${oldName}" to "${newName}"`,
        sql: `ALTER TABLE "public"."${TABLE}" RENAME COLUMN "${oldName}" TO "${newName}"`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: `verify column "${newName}" exists`,
        sql: colExistsSql(newName),
        params: ['public', TABLE, newName],
      },
    ],
  });
}

function renameToDateOp(oldName: string, newName: string) {
  return rawSql({
    id: `column.public.${TABLE}.${newName}`,
    label: `Rename column "${oldName}" to "${newName}" (date) on "${TABLE}"`,
    summary: `Renames column "${oldName}" to "${newName}" and casts to date on "${TABLE}"`,
    operationClass: 'additive',
    target: {
      id: 'postgres',
      details: { schema: 'public', objectType: 'column', name: newName, table: TABLE },
    },
    precheck: [
      {
        description: `ensure column "${newName}" is missing`,
        sql: colNotExistsSql(newName),
        params: ['public', TABLE, newName],
      },
    ],
    execute: [
      {
        description: `rename column "${oldName}" to "${newName}"`,
        sql: `ALTER TABLE "public"."${TABLE}" RENAME COLUMN "${oldName}" TO "${newName}"`,
        params: [],
      },
      {
        description: `cast column "${newName}" to date`,
        sql: `ALTER TABLE "public"."${TABLE}" ALTER COLUMN "${newName}" TYPE date USING "${newName}"::date`,
        params: [],
      },
    ],
    postcheck: [
      {
        description: `verify column "${newName}" is date`,
        sql: [
          'SELECT EXISTS (SELECT 1 AS "one" FROM "information_schema"."columns"',
          'WHERE ("table_schema" = $1 AND "table_name" = $2 AND "column_name" = $3',
          'AND "data_type" = $4)) AS "result"',
        ].join(' '),
        params: ['public', TABLE, newName, 'date'],
      },
    ],
  });
}

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Renombra el código único (preserva datos y su constraint de unicidad).
      renameColumnOp('CodCentroCto', 'cod_centro_cto'),
      rawSql({
        id: `constraint.public.${TABLE}.CentroCostos_cod_centro_cto_key`,
        label: `Rename constraint "CentroCostos_CodCentroCto_key" to "CentroCostos_cod_centro_cto_key" on "${TABLE}"`,
        summary: `Renames the unique constraint backing cod_centro_cto on "${TABLE}"`,
        operationClass: 'additive',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'constraint',
            name: 'CentroCostos_cod_centro_cto_key',
            table: TABLE,
          },
        },
        precheck: [
          {
            description: 'ensure new constraint name is missing',
            sql: constraintNotExistsSql('CentroCostos_cod_centro_cto_key'),
            params: ['CentroCostos_cod_centro_cto_key'],
          },
        ],
        execute: [
          {
            description: 'rename unique constraint',
            sql: `ALTER TABLE "public"."${TABLE}" RENAME CONSTRAINT "CentroCostos_CodCentroCto_key" TO "CentroCostos_cod_centro_cto_key"`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify new constraint name exists',
            sql: constraintExistsSql('CentroCostos_cod_centro_cto_key'),
            params: ['CentroCostos_cod_centro_cto_key'],
          },
        ],
      }),

      // Renombres simples.
      ...SIMPLE_RENAMES.map(([oldName, newName]) => renameColumnOp(oldName, newName)),

      // Renombres con cast a date.
      ...DATE_RENAMES.map(([oldName, newName]) => renameToDateOp(oldName, newName)),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);