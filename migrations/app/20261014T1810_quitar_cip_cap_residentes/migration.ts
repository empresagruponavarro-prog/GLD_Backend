#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/7d5f5baa87e6fee19d4133888ac7fe63daf16d060e663126fa0ba8b179b4bb38/contract';
import endContract from '../../snapshots/7d5f5baa87e6fee19d4133888ac7fe63daf16d060e663126fa0ba8b179b4bb38/contract.json' with { type: 'json' };
import startContract from '../../snapshots/7d5f5baa87e6fee19d4133888ac7fe63daf16d060e663126fa0ba8b179b4bb38/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      // "obra_residentes.cip_cap" se quitó del contrato sin migración; la BD aún la tiene.
      // Se elimina solo si existe y está vacía (en un entorno con datos, la migración se detiene).
      rawSql({
        id: 'column.obra_residentes.cip_cap.drop',
        label: 'Drop column cip_cap from obra_residentes',
        summary: 'Elimina la columna "cip_cap" de "obra_residentes" (sin uso en el contrato ni en el código)',
        // Es un DROP COLUMN, pero va como 'data': el contrato no cambia (from = to) y Prisma Next solo
        // admite ese tipo de migración si aporta un invariante de datos. Las comprobaciones previa y
        // posterior impiden borrar datos. El invariantId hace que la ruta incluya esta migración.
        operationClass: 'data',
        invariantId: 'obra_residentes-sin-cip_cap',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'table',
            name: 'obra_residentes',
          },
        },
        precheck: [
          {
            description: 'ensure column cip_cap exists and holds no data',
            sql: [
              'SELECT EXISTS (',
              '  SELECT 1 FROM information_schema.columns',
              "  WHERE table_schema = 'public' AND table_name = 'obra_residentes' AND column_name = 'cip_cap'",
              ') AND NOT EXISTS (',
              '  SELECT 1 FROM "public"."obra_residentes" WHERE "cip_cap" IS NOT NULL',
              ') AS "result"',
            ].join(' '),
            params: [],
          },
        ],
        execute: [
          {
            description: 'drop column cip_cap',
            sql: 'ALTER TABLE "public"."obra_residentes" DROP COLUMN "cip_cap"',
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify column cip_cap no longer exists',
            sql: [
              'SELECT NOT EXISTS (',
              '  SELECT 1 FROM information_schema.columns',
              "  WHERE table_schema = 'public' AND table_name = 'obra_residentes' AND column_name = 'cip_cap'",
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
