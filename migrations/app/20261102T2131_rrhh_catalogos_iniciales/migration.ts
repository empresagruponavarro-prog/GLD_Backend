#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract';
import endContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import startContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Opciones iniciales de los catálogos de RR.HH. (las mantiene RR.HH. después). Idempotente: no toca las
 * que ya existen con el mismo nombre.
 */
const TIPOS = ['EMPLEADO', 'OBRERO', 'PRACTICANTE', 'LOCADOR DE SERVICIOS'];
const MODALIDADES = [
  'PLAZO INDETERMINADO',
  'PLAZO FIJO (OBRA O SERVICIO ESPECÍFICO)',
  'PLAZO FIJO (INICIO O INCREMENTO DE ACTIVIDAD)',
  'PART TIME',
  'LOCACIÓN DE SERVICIOS',
  'PRÁCTICAS PRE-PROFESIONALES',
  'PRÁCTICAS PROFESIONALES',
];
const valores = (lista: readonly string[]) => lista.map((n, i) => `('${n}', ${i + 1})`).join(', ');

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.rrhh_tipo_trabajador.semilla',
        label: 'Tipos de trabajador iniciales',
        summary: 'Inserta los tipos de trabajador iniciales si no existen',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'rrhh-catalogos-iniciales',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'rrhh_tipo_trabajador' } },
        precheck: [],
        execute: [
          {
            description: 'seed rrhh_tipo_trabajador',
            sql: `INSERT INTO "public"."rrhh_tipo_trabajador" (nombre, orden) VALUES ${valores(TIPOS)} ON CONFLICT (nombre) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify rrhh_tipo_trabajador',
            sql: `SELECT (SELECT count(*) FROM "public"."rrhh_tipo_trabajador") >= ${TIPOS.length} AS "result"`,
            params: [],
          },
        ],
      }),
      rawSql({
        id: 'data.rrhh_modalidad_contrato.semilla',
        label: 'Modalidades de contrato iniciales',
        summary: 'Inserta las modalidades de contrato iniciales si no existen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'rrhh_modalidad_contrato' } },
        precheck: [],
        execute: [
          {
            description: 'seed rrhh_modalidad_contrato',
            sql: `INSERT INTO "public"."rrhh_modalidad_contrato" (nombre, orden) VALUES ${valores(MODALIDADES)} ON CONFLICT (nombre) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify rrhh_modalidad_contrato',
            sql: `SELECT (SELECT count(*) FROM "public"."rrhh_modalidad_contrato") >= ${MODALIDADES.length} AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
