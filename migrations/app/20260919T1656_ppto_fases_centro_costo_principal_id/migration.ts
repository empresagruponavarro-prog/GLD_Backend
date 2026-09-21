#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/2539bec1d18c34f1ccf90b3b5312cbaa365f932532822f19dd3c7c10881770b0/contract';
import endContract from '../../snapshots/2539bec1d18c34f1ccf90b3b5312cbaa365f932532822f19dd3c7c10881770b0/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f0299c450ba4608e0c5a42cff848e2791669b4ccd65dc8e06fa66630fdb68422/contract';
import startContract from '../../snapshots/f0299c450ba4608e0c5a42cff848e2791669b4ccd65dc8e06fa66630fdb68422/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ppto_Fases',
        column: col('id_centro_costos_principal', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      // Traduce el codigo de centro de costo principal a su id. Las 43 fases con
      // codigo mapean a exactamente un principal; la fila con codigo NULL queda en NULL.
      rawSql({
        id: 'data.ppto_Fases.backfill-id-centro-costos-principal',
        label: 'Backfill ppto_Fases.id_centro_costos_principal',
        summary:
          'Copia ppto_Fases.id_centro_costos_principal desde centro_costos_principal.id usando CodCentroCtoPrincipal = centro_costo_principal',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: 'id_centro_costos_principal',
            table: 'ppto_Fases',
          },
        },
        precheck: [
          {
            description: 'ensure rows pending id_centro_costos_principal backfill',
            sql: [
              'SELECT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ppto_Fases" f',
              '  JOIN "public"."centro_costos_principal" p ON p."centro_costo_principal" = f."CodCentroCtoPrincipal"',
              '  WHERE f.id_centro_costos_principal IS DISTINCT FROM p.id',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'copy centro_costos_principal id into ppto_Fases.id_centro_costos_principal',
            sql: [
              'UPDATE "public"."ppto_Fases" f',
              'SET id_centro_costos_principal = p.id',
              'FROM "public"."centro_costos_principal" p',
              'WHERE p."centro_costo_principal" = f."CodCentroCtoPrincipal"',
              '  AND f.id_centro_costos_principal IS DISTINCT FROM p.id',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify no rows pending id_centro_costos_principal backfill',
            sql: [
              'SELECT NOT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ppto_Fases" f',
              '  JOIN "public"."centro_costos_principal" p ON p."centro_costo_principal" = f."CodCentroCtoPrincipal"',
              '  WHERE f.id_centro_costos_principal IS DISTINCT FROM p.id',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
      }),
      this.dropColumn({ schema: 'public', table: 'ppto_Fases', column: 'CodCentroCtoPrincipal' }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Fases',
        index: 'ppto_Fases_id_centro_costos_principal_idx_33100da8',
        columns: ['id_centro_costos_principal'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Fases',
        foreignKey: {
          name: 'ppto_Fases_id_centro_costos_principal_fkey',
          columns: ['id_centro_costos_principal'],
          references: { schema: 'public', table: 'centro_costos_principal', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
