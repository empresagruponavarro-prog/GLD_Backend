#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/412134a7bbfb52c5c96ce90bd72cf400cf2687cfd4b2c8bcd58d16e808189210/contract';
import endContract from '../../snapshots/412134a7bbfb52c5c96ce90bd72cf400cf2687cfd4b2c8bcd58d16e808189210/contract.json' with { type: 'json' };
import startContract from '../../snapshots/412134a7bbfb52c5c96ce90bd72cf400cf2687cfd4b2c8bcd58d16e808189210/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Elimina de "CentroCostos" las filas que son unicamente padres (ya
      // migradas a "centro_costos_principal"). Solo una fila es madre si otras
      // filas la referencian via "CodCentroCtoPrincipal".
      rawSql({
        id: 'data.CentroCostos.eliminar-filas-padre',
        label: 'Delete parent-only rows from CentroCostos',
        summary: 'Elimina de "CentroCostos" las filas referenciadas como principal (ya migradas a "centro_costos_principal")',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'table',
            name: 'CentroCostos',
          },
        },
        precheck: [
          {
            description: 'ensure parent rows exist and every one is backed by centro_costos_principal',
            sql: [
              'SELECT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."CentroCostos" p',
              '  WHERE p."CodCentroCto" IS NOT NULL AND p."CodCentroCto" <> \'\'',
              '    AND EXISTS (SELECT 1 FROM "public"."CentroCostos" cc WHERE cc."CodCentroCtoPrincipal" = p."CodCentroCto")',
              '    AND NOT EXISTS (SELECT 1 FROM "public"."centro_costos_principal" m WHERE m.centro_costo_principal = p."CodCentroCto")',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'delete parent-only rows',
            sql: [
              'DELETE FROM "public"."CentroCostos" p',
              'WHERE p."CodCentroCto" IS NOT NULL AND p."CodCentroCto" <> \'\'',
              '  AND EXISTS (SELECT 1 FROM "public"."CentroCostos" cc WHERE cc."CodCentroCtoPrincipal" = p."CodCentroCto")',
              '  AND EXISTS (SELECT 1 FROM "public"."centro_costos_principal" m WHERE m.centro_costo_principal = p."CodCentroCto")',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify no rows referenced as principal remain',
            sql: [
              'SELECT NOT EXISTS (',
              '  SELECT 1 FROM "public"."CentroCostos" p',
              '  WHERE EXISTS (SELECT 1 FROM "public"."CentroCostos" cc WHERE cc."CodCentroCtoPrincipal" = p."CodCentroCto")',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
