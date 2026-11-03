#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract';
import endContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import startContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/** [tabla, nombre, expresión]: las reglas de rango de `20261030T0435_operaciones_control` (el contrato no las expresa). */
const CHECKS: ReadonlyArray<readonly [string, string, string]> = [
  ['obra_subpartida', 'obra_subpartida_fechas_check', `"fecha_fin" >= "fecha_inicio"`],
  ['obra_subpartida_semana', 'obra_subpartida_semana_numero_check', `"numero_semana" BETWEEN 1 AND 16`],
  ['obra_subpartida_semana', 'obra_subpartida_semana_meta_check', `"meta" IS NULL OR ("meta" BETWEEN 0 AND 100 AND "numero_semana" <= 10)`],
  ['obra_subpartida_semana', 'obra_subpartida_semana_avance_check', `"avance" IS NULL OR "avance" BETWEEN 0 AND 100`],
  ['obra_reprogramacion', 'obra_reprogramacion_dias_check', `"dias" BETWEEN 1 AND 60`],
  ['obra_evento', 'obra_evento_severidad_check', `"severidad" IN ('info', 'good', 'warn', 'crit')`],
  ['obra_datos_generales', 'obra_datos_generales_avance_check', `"avance_general" IS NULL OR "avance_general" BETWEEN 0 AND 100`],
  ['obra_datos_generales', 'obra_datos_generales_postventa_check', `"plazo_postventa_dias" IS NULL OR "plazo_postventa_dias" BETWEEN 1 AND 365`],
];

/**
 * Crea la regla si falta. Entra como NOT VALID (rige para lo que se escriba desde ahora) y luego intenta
 * validarla: si alguna fila vieja la incumple, queda sin validar en vez de frenar el despliegue.
 */
const crearCheck = (tabla: string, nombre: string, expresion: string) =>
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${nombre}') THEN
    ALTER TABLE "public"."${tabla}" ADD CONSTRAINT "${nombre}" CHECK (${expresion}) NOT VALID;
  END IF;
  BEGIN
    ALTER TABLE "public"."${tabla}" VALIDATE CONSTRAINT "${nombre}";
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'La regla % queda sin validar: hay filas antiguas que no la cumplen', '${nombre}';
  END;
END $$`;

/**
 * Repone lo que `20261030T0435_operaciones_control` traía y no es estructura: en las bases que llegaron a ese contrato
 * con `prisma db update` (local y servidor) nunca se ejecutó. Módulo de permisos `operaciones` (Dashboard de
 * Operaciones, sin concesiones) y las 8 reglas de rango de las tablas de obra. Idempotente.
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.modulo.operaciones.reponer',
        label: 'Repone el módulo operaciones',
        summary: 'Inserta el módulo operaciones (Dashboard de Operaciones) si no existe; no concede permisos a ningún rol',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'operaciones-modulo-y-reglas',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'seed modulo operaciones',
            sql: `INSERT INTO "public"."modulo" (clave, nombre, grupo, ruta, orden, admite_aprobar, admite_anular) VALUES ('operaciones', 'Dashboard de operaciones', 'Proyectos', '/operaciones', 34, false, false) ON CONFLICT (clave) DO NOTHING`,
            params: [],
          },
          ...CHECKS.map(([tabla, nombre, expresion]) => ({ description: `regla ${nombre}`, sql: crearCheck(tabla, nombre, expresion), params: [] })),
        ],
        postcheck: [
          {
            description: 'el módulo operaciones y las 8 reglas existen',
            sql: `SELECT EXISTS (SELECT 1 FROM "public"."modulo" WHERE clave = 'operaciones') AND (SELECT count(*) FROM pg_constraint WHERE conname IN (${CHECKS.map(([, n]) => `'${n}'`).join(', ')})) = ${CHECKS.length} AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
