#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8c4a3c6b9e3f579a0d0d0bbaccaf0e303321a429aef9fa29d2979ecb2f37ce53/contract';
import endContract from '../../snapshots/8c4a3c6b9e3f579a0d0d0bbaccaf0e303321a429aef9fa29d2979ecb2f37ce53/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/989d1e75ad4bde39f861790d0cbba8f60053f059a77ffa2fbc9970cc06bc50ec/contract';
import startContract from '../../snapshots/989d1e75ad4bde39f861790d0cbba8f60053f059a77ffa2fbc9970cc06bc50ec/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

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

function indexExistsSql(index: string): string {
  return [
    'SELECT EXISTS (SELECT 1 AS "one" FROM "pg_indexes"',
    'WHERE ("schemaname" = $1 AND "tablename" = $2 AND "indexname" = $3)) AS "result"',
  ].join(' ');
}

function indexNotExistsSql(index: string): string {
  return [
    'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "pg_indexes"',
    'WHERE ("schemaname" = $1 AND "tablename" = $2 AND "indexname" = $3)) AS "result"',
  ].join(' ');
}

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Renombra la FK "EmpresaId" a "id_empresa" en cada tabla hija (preserva datos).
      ...TABLES.map((table) =>
        rawSql({
          id: `column.public.${table}.id_empresa`,
          label: `Rename column "EmpresaId" to "id_empresa" on "${table}"`,
          summary: `Renames column "EmpresaId" to "id_empresa" on "${table}"`,
          operationClass: 'additive',
          target: {
            id: 'postgres',
            details: { schema: 'public', objectType: 'column', name: 'id_empresa', table },
          },
          precheck: [
            {
              description: `ensure column "id_empresa" is missing`,
              sql: colNotExistsSql('id_empresa'),
              params: ['public', table, 'id_empresa'],
            },
          ],
          execute: [
            {
              description: `rename column "EmpresaId" to "id_empresa"`,
              sql: `ALTER TABLE "public"."${table}" RENAME COLUMN "EmpresaId" TO "id_empresa"`,
              params: [],
            },
          ],
          postcheck: [
            {
              description: `verify column "id_empresa" exists`,
              sql: colExistsSql('id_empresa'),
              params: ['public', table, 'id_empresa'],
            },
          ],
        }),
      ),

      // Renombra los índices de soporte de la FK (el hash del campo cambió con el rename).
      ...TABLES.map((table) => {
        const oldIndex = `${table}_EmpresaId_idx_1fa20859`;
        const newIndex = `${table}_id_empresa_idx_328936e2`;
        return rawSql({
          id: `index.public.${table}.${newIndex}`,
          label: `Rename index "${oldIndex}" to "${newIndex}" on "${table}"`,
          summary: `Renames index "${oldIndex}" to "${newIndex}" on "${table}"`,
          operationClass: 'additive',
          target: {
            id: 'postgres',
            details: { schema: 'public', objectType: 'index', name: newIndex, table },
          },
          precheck: [
            {
              description: `ensure index "${newIndex}" is missing`,
              sql: indexNotExistsSql(newIndex),
              params: ['public', table, newIndex],
            },
          ],
          execute: [
            {
              description: `rename index "${oldIndex}" to "${newIndex}"`,
              sql: `ALTER INDEX "public"."${oldIndex}" RENAME TO "${newIndex}"`,
              params: [],
            },
          ],
          postcheck: [
            {
              description: `verify index "${newIndex}" exists`,
              sql: indexExistsSql(newIndex),
              params: ['public', table, newIndex],
            },
          ],
        });
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
