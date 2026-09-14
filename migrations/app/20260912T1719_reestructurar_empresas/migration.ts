#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/989d1e75ad4bde39f861790d0cbba8f60053f059a77ffa2fbc9970cc06bc50ec/contract';
import endContract from '../../snapshots/989d1e75ad4bde39f861790d0cbba8f60053f059a77ffa2fbc9970cc06bc50ec/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9c1d3ea755b10b5d3b6f7feec5df729d2ee951b95d76edd4bf3c41f4be9fa08a/contract';
import startContract from '../../snapshots/9c1d3ea755b10b5d3b6f7feec5df729d2ee951b95d76edd4bf3c41f4be9fa08a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

const TABLES = [
  'almacenMovimientos',
  'almacenes',
  'cajaEgresosRetail',
  'cajaIngresos',
  'CentroCostos',
  'contrataciones',
  'contrataciones_PPTOMeta',
  'contrataciones_PostVenta',
  'cuentasCajaBancos',
  'docCompra',
  'docCompraDetalle',
  'docCompra_AplicacionAnticipo',
  'docVenta',
  'docVentaDetalle',
  'egresos_AnticiposOC',
  'ordenCompra',
  'planillaPago',
  'ppto_DetalleFases',
  'ppto_DetalleFasesCate',
  'ppto_Fases',
  'ppto_Principal',
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

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    const renames: Array<{ from: string; to: string }> = [
      { from: 'id', to: 'id_empresa' },
      { from: 'RUC', to: 'ruc' },
      { from: 'RazonSocial', to: 'razon_social' },
      { from: 'DomicilioFiscal', to: 'domicilio_fiscal' },
      { from: 'DireccionEntrega', to: 'direccion_entrega' },
      { from: 'CorreoCompras', to: 'correo_compras' },
    ];

    return [
      // 1) Renombra las columnas de "empresas" (preserva datos y PK).
      ...renames.map(({ from, to }) =>
        rawSql({
          id: `column.public.empresas.${to}`,
          label: `Rename column "${from}" to "${to}" on "empresas"`,
          summary: `Renames column "${from}" to "${to}" on "empresas"`,
          operationClass: 'additive',
          target: {
            id: 'postgres',
            details: { schema: 'public', objectType: 'column', name: to, table: 'empresas' },
          },
          precheck: [
            {
              description: `ensure column "${to}" is missing`,
              sql: colNotExistsSql(to),
              params: ['public', 'empresas', to],
            },
          ],
          execute: [
            {
              description: `rename column "${from}" to "${to}"`,
              sql: `ALTER TABLE "public"."empresas" RENAME COLUMN "${from}" TO "${to}"`,
              params: [],
            },
          ],
          postcheck: [
            {
              description: `verify column "${to}" exists`,
              sql: colExistsSql(to),
              params: ['public', 'empresas', to],
            },
          ],
        }),
      ),

      // 2) Agrega la columna "EmpresaId" a cada tabla hija.
      ...TABLES.map((table) =>
        this.addColumn({
          schema: 'public',
          table,
          column: col('EmpresaId', 'integer', { codecRef: { codecId: 'pg/int4@1' } }),
        }),
      ),

      // 3) Backfill: mapea el código viejo "CodEmpresa" (E1..E4) al nuevo "EmpresaId".
      ...TABLES.map((table) =>
        rawSql({
          id: `data.public.${table}.backfillEmpresaId`,
          label: `Backfill "EmpresaId" on "${table}" from "empresas"`,
          summary: `Backfills "EmpresaId" on "${table}" by joining "CodEmpresa" against "empresas"`,
          operationClass: 'data',
          target: {
            id: 'postgres',
            details: { schema: 'public', objectType: 'column', name: 'EmpresaId', table },
          },
          precheck: [
            {
              description: 'ensure there are rows to backfill',
              sql: [
                'SELECT EXISTS (SELECT 1 AS "one" FROM "public"."' + table + '" AS "t"',
                'WHERE ("t"."CodEmpresa" IS NOT NULL AND "t"."EmpresaId" IS NULL)) AS "result"',
              ].join(' '),
              params: [],
            },
          ],
          execute: [
            {
              description: 'backfill "EmpresaId"',
              sql: [
                'UPDATE "public"."' + table + '" AS "t"',
                'SET "EmpresaId" = "e"."id_empresa"',
                'FROM "public"."empresas" AS "e"',
                'WHERE ("e"."CodEmpresa" = "t"."CodEmpresa")',
              ].join(' '),
              params: [],
            },
          ],
          postcheck: [
            {
              description: 'verify no rows remain unmapped',
              sql: [
                'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."' + table + '" AS "t"',
                'WHERE ("t"."CodEmpresa" IS NOT NULL AND "t"."EmpresaId" IS NULL)) AS "result"',
              ].join(' '),
              params: [],
            },
          ],
        }),
      ),

      // 4) FK: "EmpresaId" -> "empresas"("id_empresa") ON DELETE SET NULL.
      ...TABLES.map((table) =>
        this.addForeignKey({
          schema: 'public',
          table,
          foreignKey: {
            name: `${table}_EmpresaId_fkey`,
            columns: ['EmpresaId'],
            references: { schema: 'public', table: 'empresas', columns: ['id_empresa'] },
            onDelete: 'setNull',
          },
        }),
      ),

      // 5) Índice de soporte para la FK.
      ...TABLES.map((table) =>
        this.createIndex({
          schema: 'public',
          table,
          index: `${table}_EmpresaId_idx_1fa20859`,
          columns: ['EmpresaId'],
        }),
      ),

      // 6) Elimina la columna "CodEmpresa" de cada tabla hija.
      ...TABLES.map((table) =>
        this.dropColumn({ schema: 'public', table, column: 'CodEmpresa' }),
      ),

      // 7) Elimina "CodEmpresa" de "empresas" (ya no es parte del contrato).
      this.dropColumn({ schema: 'public', table: 'empresas', column: 'CodEmpresa' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
