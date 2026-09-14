#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3203a9590cce1fbfa63c39174514a45b42e410880af625d758891555f00e2959/contract';
import endContract from '../../snapshots/3203a9590cce1fbfa63c39174514a45b42e410880af625d758891555f00e2959/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/412134a7bbfb52c5c96ce90bd72cf400cf2687cfd4b2c8bcd58d16e808189210/contract';
import startContract from '../../snapshots/412134a7bbfb52c5c96ce90bd72cf400cf2687cfd4b2c8bcd58d16e808189210/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // 1) Agrega la nueva columna int (nullable) — conserva el dato original.
      this.addColumn({
        schema: 'public',
        table: 'CentroCostos',
        column: col('id_centro_costos_principal', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),

      // 2) Backfill: mapea cada "CodCentroCtoPrincipal" (código) al "id" del
      // maestro "centro_costos_principal".
      rawSql({
        id: 'data.CentroCostos.backfill-id-centro-costos-principal',
        label: 'Backfill id_centro_costos_principal from CodCentroCtoPrincipal',
        summary: 'Traduce CodCentroCtoPrincipal (codigo) al id de "centro_costos_principal"',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: 'id_centro_costos_principal',
            table: 'CentroCostos',
          },
        },
        precheck: [
          {
            description: 'ensure rows still pending backfill',
            sql: [
              'SELECT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."CentroCostos" h',
              '  WHERE h."CodCentroCtoPrincipal" IS NOT NULL',
              '    AND h.id_centro_costos_principal IS NULL',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'copy mapped ids',
            sql: [
              'UPDATE "public"."CentroCostos" h',
              'SET id_centro_costos_principal = m.id',
              'FROM "public"."centro_costos_principal" m',
              'WHERE h."CodCentroCtoPrincipal" IS NOT NULL',
              '  AND m.centro_costo_principal = h."CodCentroCtoPrincipal"',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify every previous code reference was mapped',
            sql: [
              'SELECT NOT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."CentroCostos" h',
              '  WHERE h."CodCentroCtoPrincipal" IS NOT NULL',
              '    AND h.id_centro_costos_principal IS NULL',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
      }),

      // 3) Ahora sí, elimina la via antigua: FK, índice y columna de código.
      this.dropConstraint({
        schema: 'public',
        table: 'CentroCostos',
        constraint: 'CentroCostos_CodCentroCtoPrincipal_fkey',
        kind: 'foreignKey',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'CentroCostos',
        index: 'CentroCostos_CodCentroCtoPrincipal_idx_04283025',
      }),
      this.dropColumn({ schema: 'public', table: 'CentroCostos', column: 'CodCentroCtoPrincipal' }),

      // 4) Índice + FK nueva hacia centro_costos_principal.id.
      this.createIndex({
        schema: 'public',
        table: 'CentroCostos',
        index: 'CentroCostos_id_centro_costos_principal_idx_33100da8',
        columns: ['id_centro_costos_principal'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CentroCostos',
        foreignKey: {
          name: 'CentroCostos_id_centro_costos_principal_fkey',
          columns: ['id_centro_costos_principal'],
          references: { schema: 'public', table: 'centro_costos_principal', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
