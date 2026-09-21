#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/029a653983b1de65309c43fa0fec81d4a5d1bb9ccd8b5adca3752adb9270964c/contract';
import endContract from '../../snapshots/029a653983b1de65309c43fa0fec81d4a5d1bb9ccd8b5adca3752adb9270964c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/95143ed3b6d3c1b22d4a667ee5b20920d44923b35aa0c0636c669b2fd5d6319a/contract';
import startContract from '../../snapshots/95143ed3b6d3c1b22d4a667ee5b20920d44923b35aa0c0636c669b2fd5d6319a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // Una OC historica usa "ACABADOS", codigo que no existe en "categoria".
      // Se registra para poder crear la FK sin perder el dato.
      rawSql({
        id: 'data.categoria.asegurar-acabados',
        label: 'Ensure categoria ACABADOS exists',
        summary: 'Registra la categoria "ACABADOS" referenciada por una OC historica y ausente en "categoria"',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'table',
            name: 'categoria',
          },
        },
        precheck: [
          {
            description: 'ensure categoria "ACABADOS" is missing',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."categoria" WHERE codigo = \'ACABADOS\') AS "result"',
            params: [],
          },
        ],
        execute: [
          {
            description: 'insert categoria "ACABADOS" (COSTO DIRECTO - CONTRATISTA)',
            sql: [
              'INSERT INTO "public"."categoria" (codigo, descripcion, estado, id_tipo_categoria)',
              'SELECT \'ACABADOS\', \'ACABADOS (migrado desde ordenCompra)\', true, 2',
              'WHERE NOT EXISTS (SELECT 1 FROM "public"."categoria" WHERE codigo = \'ACABADOS\')',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify categoria "ACABADOS" exists',
            sql: 'SELECT EXISTS (SELECT 1 AS "one" FROM "public"."categoria" WHERE codigo = \'ACABADOS\') AS "result"',
            params: [],
          },
        ],
      }),
      this.alterColumnType({
        schema: 'public',
        table: 'ordenCompra',
        column: 'CategoriaCodigo',
        options: {
          qualifiedTargetType: 'text',
          formatTypeExpected: 'text',
          rawTargetTypeForLabel: 'text',
        },
      }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompra',
        index: 'ordenCompra_CategoriaCodigo_idx_2b1c916f',
        columns: ['CategoriaCodigo'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompra',
        foreignKey: {
          name: 'ordenCompra_CategoriaCodigo_fkey',
          columns: ['CategoriaCodigo'],
          references: { schema: 'public', table: 'categoria', columns: ['codigo'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
