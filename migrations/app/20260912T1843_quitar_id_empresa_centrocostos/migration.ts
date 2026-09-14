#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3203a9590cce1fbfa63c39174514a45b42e410880af625d758891555f00e2959/contract';
import startContract from '../../snapshots/3203a9590cce1fbfa63c39174514a45b42e410880af625d758891555f00e2959/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c5d53dc291b196b2457a966e2f110f28d5e776d3cc1d8ff4e9f283cce6b815ab/contract';
import endContract from '../../snapshots/c5d53dc291b196b2457a966e2f110f28d5e776d3cc1d8ff4e9f283cce6b815ab/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

// Padre por defecto (GASTS OPER./ADMINISTR.) para cada empresa:
// 1->3 GASTOS OPERATIVOS - GLD, 2->31 GASTO OPERATIVOS GAR 415,
// 3->5 GASTOS ADMINISTRATIVOS RAD 415, 4->8 GASTOS OPERATIVOS - GALDA
const DEFAULT_PRINCIPAL_POR_EMPRESA: [number, number][] = [
  [1, 3],
  [2, 31],
  [3, 5],
  [4, 8],
];

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // 1) Asigna padre por defecto a hijos con empresa pero sin padre, y
      //    reasigna hijos cuya empresa no coincide con la de su padre
      //    (padres compartidos entre empresas - excepciones).
      rawSql({
        id: 'data.CentroCostos.alinear-padre-por-empresa',
        label: 'Align children padre by empresa',
        summary: 'Asigna el padre por defecto de la empresa a hijos sin padre y a hijos con empresa distinta a su padre',
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
            description: 'ensure rows pending alignment',
            sql: [
              'SELECT EXISTS (SELECT 1 AS "one" FROM "public"."CentroCostos" h',
              '  LEFT JOIN "public"."centro_costos_principal" m ON m.id = h.id_centro_costos_principal',
              '  WHERE (h.id_centro_costos_principal IS NULL AND h.id_empresa IS NOT NULL)',
              '     OR (h.id_centro_costos_principal IS NOT NULL AND h.id_empresa IS NOT NULL AND m.id_empresa <> h.id_empresa))',
              ' AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'assign default padre when empresa set (covers both sin padre and mismatched padre)',
            sql: [
              'UPDATE "public"."CentroCostos" h',
              'SET id_centro_costos_principal = d.padre_id',
              'FROM (VALUES (1, 3), (2, 31), (3, 5), (4, 8)) AS d(id_empresa, padre_id)',
              'WHERE h.id_empresa = d.id_empresa',
              '  AND (h.id_centro_costos_principal IS NULL',
              '      OR h.id_centro_costos_principal IN (',
              '        SELECT m.id FROM "public"."centro_costos_principal" m WHERE m.id_empresa <> h.id_empresa))',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify no empresa mismatches remain',
            sql: [
              'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."CentroCostos" h',
              '  LEFT JOIN "public"."centro_costos_principal" m ON m.id = h.id_centro_costos_principal',
              '  WHERE h.id_centro_costos_principal IS NOT NULL AND h.id_empresa IS NOT NULL AND m.id_empresa <> h.id_empresa)',
              ' AS "result"',
            ].join(' '),
            params: [],
          },
        ],
      }),

      // 2) Ahora elimina la columna id_empresa: la empresa vive en el padre.
      this.dropConstraint({
        schema: 'public',
        table: 'CentroCostos',
        constraint: 'CentroCostos_id_empresa_fkey',
        kind: 'foreignKey',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'CentroCostos',
        index: 'CentroCostos_id_empresa_idx_328936e2',
      }),
      this.dropColumn({ schema: 'public', table: 'CentroCostos', column: 'id_empresa' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
