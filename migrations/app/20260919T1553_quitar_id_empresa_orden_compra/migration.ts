#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/95143ed3b6d3c1b22d4a667ee5b20920d44923b35aa0c0636c669b2fd5d6319a/contract';
import endContract from '../../snapshots/95143ed3b6d3c1b22d4a667ee5b20920d44923b35aa0c0636c669b2fd5d6319a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/fecd990094024bcfd5fc94cc80ea5d1c4b42a33b650a3b3588ed6694bd2f1b12/contract';
import startContract from '../../snapshots/fecd990094024bcfd5fc94cc80ea5d1c4b42a33b650a3b3588ed6694bd2f1b12/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Alinea la empresa de la OC con la del padre de su centro de costo:
      // la empresa pasa a derivarse del centro de costo, por lo que primero
      // corregimos las filas historicas donde no coincidian.
      rawSql({
        id: 'data.ordenCompra.alinear-empresa-con-centro-costo',
        label: 'Align ordenCompra empresa with centro de costo',
        summary:
          'Corrige ordenCompra.id_empresa para que coincida con centro_costos_principal.id_empresa del centro de costo asociado',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: 'id_empresa',
            table: 'ordenCompra',
          },
        },
        precheck: [
          {
            description: 'ensure rows pending empresa alignment',
            sql: [
              'SELECT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ordenCompra" oc',
              '  JOIN "public"."CentroCostos" cc ON cc.id = oc.id_centro_costo',
              '  JOIN "public"."centro_costos_principal" ccp ON ccp.id = cc.id_centro_costos_principal',
              '  WHERE oc.id_empresa IS DISTINCT FROM ccp.id_empresa',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'align ordenCompra.id_empresa with the empresa of its centro de costo',
            sql: [
              'UPDATE "public"."ordenCompra" oc',
              'SET id_empresa = ccp.id_empresa',
              'FROM "public"."CentroCostos" cc',
              'JOIN "public"."centro_costos_principal" ccp ON ccp.id = cc.id_centro_costos_principal',
              'WHERE cc.id = oc.id_centro_costo',
              '  AND oc.id_empresa IS DISTINCT FROM ccp.id_empresa',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify no empresa mismatches remain',
            sql: [
              'SELECT NOT EXISTS (',
              '  SELECT 1 AS "one" FROM "public"."ordenCompra" oc',
              '  JOIN "public"."CentroCostos" cc ON cc.id = oc.id_centro_costo',
              '  JOIN "public"."centro_costos_principal" ccp ON ccp.id = cc.id_centro_costos_principal',
              '  WHERE oc.id_empresa IS DISTINCT FROM ccp.id_empresa',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'ordenCompra',
        constraint: 'ordenCompra_id_empresa_fkey',
        kind: 'foreignKey',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'ordenCompra',
        index: 'ordenCompra_id_empresa_idx_328936e2',
      }),
      this.dropColumn({ schema: 'public', table: 'ordenCompra', column: 'id_empresa' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
