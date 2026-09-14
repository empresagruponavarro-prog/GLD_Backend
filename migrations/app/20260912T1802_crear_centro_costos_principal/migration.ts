#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/964a2169b8bce651308dc94204dad286cbe434809fe2532ed9b79130d5311e44/contract';
import endContract from '../../snapshots/964a2169b8bce651308dc94204dad286cbe434809fe2532ed9b79130d5311e44/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fc29048f51fc25f9e76102d676db312aef79d6ed99153e297cb181e428d62e93/contract';
import startContract from '../../snapshots/fc29048f51fc25f9e76102d676db312aef79d6ed99153e297cb181e428d62e93/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'centro_costos_principal',
        columns: [
          col('centro_costo_principal', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('descripcion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('estado', 'character varying(50)', {
            notNull: true,
            default: lit('ABIERTO'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_empresa', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'centro_costos_principal',
        constraint: 'centro_costos_principal_centro_costo_principal_key',
        columns: ['centro_costo_principal'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'centro_costos_principal',
        index: 'centro_costos_principal_id_empresa_idx_328936e2',
        columns: ['id_empresa'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'centro_costos_principal',
        foreignKey: {
          name: 'centro_costos_principal_id_empresa_fkey',
          columns: ['id_empresa'],
          references: { schema: 'public', table: 'empresas', columns: ['id_empresa'] },
          onDelete: 'setNull',
        },
      }),

      // Migra los centros de costos "padre" existentes en "CentroCostos" a la
      // nueva tabla maestra. Idempotente (ON CONFLICT DO NOTHING).
      rawSql({
        id: 'data.centro_costos_principal.backfill',
        label: 'Backfill centros de costos principales',
        summary:
          'Inserta en "centro_costos_principal" los CodCentroCto referenciados como principal en "CentroCostos"',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'table',
            name: 'centro_costos_principal',
          },
        },
        precheck: [
          {
            description: 'ensure table "centro_costos_principal" exists',
            sql: 'SELECT EXISTS (SELECT 1 AS "one" FROM "information_schema"."tables" WHERE ("table_schema" = $1 AND "table_name" = $2)) AS "result"',
            params: ['public', 'centro_costos_principal'],
          },
        ],
        execute: [
          {
            description: 'backfill centros de costos principales',
            sql: [
              'INSERT INTO "public"."centro_costos_principal"',
              '  ("centro_costo_principal", "descripcion", "estado", "id_empresa")',
              'SELECT DISTINCT ON (p."CodCentroCto")',
              '  p."CodCentroCto",',
              '  COALESCE(NULLIF(p."CentroCosto", \'\'), p."CodCentroCto"),',
              '  COALESCE(NULLIF(p."Estado", \'\'), \'ABIERTO\'),',
              '  p."id_empresa"',
              'FROM "public"."CentroCostos" p',
              'WHERE p."CodCentroCto" IN (',
              '  SELECT DISTINCT cc."CodCentroCtoPrincipal" FROM "public"."CentroCostos" cc',
              '  WHERE cc."CodCentroCtoPrincipal" IS NOT NULL AND cc."CodCentroCtoPrincipal" <> \'\'',
              ')',
              'ORDER BY p."CodCentroCto", p."id"',
              'ON CONFLICT ("centro_costo_principal") DO NOTHING',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify backfill produced rows',
            sql: 'SELECT EXISTS (SELECT 1 AS "one" FROM "public"."centro_costos_principal") AS "result"',
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
