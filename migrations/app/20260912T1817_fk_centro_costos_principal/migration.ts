#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/412134a7bbfb52c5c96ce90bd72cf400cf2687cfd4b2c8bcd58d16e808189210/contract';
import endContract from '../../snapshots/412134a7bbfb52c5c96ce90bd72cf400cf2687cfd4b2c8bcd58d16e808189210/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/964a2169b8bce651308dc94204dad286cbe434809fe2532ed9b79130d5311e44/contract';
import startContract from '../../snapshots/964a2169b8bce651308dc94204dad286cbe434809fe2532ed9b79130d5311e44/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Limpia la referencia huérfana "00321ecc" (padre inexistente) ANTES de
      // crear la FK. Se decide dejar "TALLER GAR 415" sin padre (NULL).
      rawSql({
        id: 'data.CentroCostos.codigo-principal-huerfano',
        label: 'Null orphan "CodCentroCtoPrincipal" reference',
        summary: 'Pone a NULL "CodCentroCtoPrincipal" = \'00321ecc\' en "CentroCostos" (padre inexistente)',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: 'CodCentroCtoPrincipal',
            table: 'CentroCostos',
          },
        },
        precheck: [
          {
            description: 'ensure orphan reference exists',
            sql: 'SELECT EXISTS (SELECT 1 AS "one" FROM "public"."CentroCostos" WHERE "CodCentroCtoPrincipal" = $1 AND "CodCentroCtoPrincipal" NOT IN (SELECT "centro_costo_principal" FROM "public"."centro_costos_principal")) AS "result"',
            params: ['00321ecc'],
          },
        ],
        execute: [
          {
            description: 'set orphan reference to NULL',
            sql: 'UPDATE "public"."CentroCostos" SET "CodCentroCtoPrincipal" = NULL WHERE "CodCentroCtoPrincipal" = $1',
            params: ['00321ecc'],
          },
        ],
        postcheck: [
          {
            description: 'verify no orphan references remain',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."CentroCostos" WHERE "CodCentroCtoPrincipal" IS NOT NULL AND "CodCentroCtoPrincipal" NOT IN (SELECT "centro_costo_principal" FROM "public"."centro_costos_principal")) AS "result"',
            params: [],
          },
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CentroCostos',
        index: 'CentroCostos_CodCentroCtoPrincipal_idx_04283025',
        columns: ['CodCentroCtoPrincipal'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CentroCostos',
        foreignKey: {
          name: 'CentroCostos_CodCentroCtoPrincipal_fkey',
          columns: ['CodCentroCtoPrincipal'],
          references: {
            schema: 'public',
            table: 'centro_costos_principal',
            columns: ['centro_costo_principal'],
          },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
