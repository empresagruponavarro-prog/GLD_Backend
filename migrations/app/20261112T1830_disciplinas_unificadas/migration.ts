#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/3ee462c8e7bd29067f4ac4cade42f49ce1ac0a34d4bb2d23145ba9d9b70423f9/contract';
import endContract from '../../snapshots/3ee462c8e7bd29067f4ac4cade42f49ce1ac0a34d4bb2d23145ba9d9b70423f9/contract.json' with { type: 'json' };
import startContract from '../../snapshots/3ee462c8e7bd29067f4ac4cade42f49ce1ac0a34d4bb2d23145ba9d9b70423f9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Una sola lista de disciplinas: la columna «Disciplina» de los tipos de plano (Catálogos de proyecto). Unifica los nombres
 * repetidos (ELÉCTRICAS → INSTALACIONES ELÉCTRICAS, SANITARIAS → INSTALACIONES SANITARIAS, MECÁNICAS → INSTALACIONES
 * MECÁNICAS) y pasa los planos ya subidos de la lista fija de antes («Arquitectura», «Eléctricas»…) a esos mismos nombres en
 * mayúsculas. Solo datos e idempotente.
 */
const normal = (col: string) => `upper(translate(btrim(${col}), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))`;
const unificar = (col: string) => `CASE ${normal(col)}
    WHEN 'ELECTRICAS' THEN 'INSTALACIONES ELÉCTRICAS'
    WHEN 'INSTALACIONES ELECTRICAS' THEN 'INSTALACIONES ELÉCTRICAS'
    WHEN 'SANITARIAS' THEN 'INSTALACIONES SANITARIAS'
    WHEN 'INSTALACIONES SANITARIAS' THEN 'INSTALACIONES SANITARIAS'
    WHEN 'MECANICAS' THEN 'INSTALACIONES MECÁNICAS'
    WHEN 'INSTALACIONES MECANICAS' THEN 'INSTALACIONES MECÁNICAS'
    ELSE upper(btrim(${col})) END`;
const pendientes = (tabla: string) =>
  `SELECT 1 FROM "public"."${tabla}" WHERE "disciplina" IS NOT NULL AND "disciplina" <> ${unificar('"disciplina"')}`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.disciplinas.unificadas',
        label: 'Unifica los nombres de las disciplinas de plano',
        summary: 'Tipos de plano y planos de obra con un solo nombre por disciplina, en mayúsculas',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'disciplinas-unificadas',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'tipo_plano' } },
        precheck: [],
        execute: [
          {
            description: 'tipos de plano: un nombre por disciplina',
            sql: `UPDATE "public"."tipo_plano" SET "disciplina" = ${unificar('"disciplina"')}
                  WHERE "disciplina" IS NOT NULL AND "disciplina" <> ${unificar('"disciplina"')}`,
            params: [],
          },
          {
            description: 'planos de obra: la disciplina con el nombre del catálogo',
            sql: `UPDATE "public"."obra_planos" SET "disciplina" = ${unificar('"disciplina"')}
                  WHERE "disciplina" IS NOT NULL AND "disciplina" <> ${unificar('"disciplina"')}`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'no queda ninguna disciplina con otro nombre',
            sql: `SELECT NOT EXISTS (${pendientes('tipo_plano')}) AND NOT EXISTS (${pendientes('obra_planos')}) AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
