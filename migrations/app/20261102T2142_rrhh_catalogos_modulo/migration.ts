#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract';
import endContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import startContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * RR.HH. › Catálogos de RR.HH. (orden 40): mantener tipos de trabajador y modalidades de contrato. Permiso
 * aparte de Trabajadores para que editar trabajadores no permita cambiar las listas: no se concede a ningún
 * rol (el Administrador lo tiene siempre); se asigna en Roles y permisos. Idempotente.
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.modulo.rrhh.catalogos',
        label: 'Semilla del módulo RR.HH. › Catálogos de RR.HH.',
        summary: 'Inserta el módulo rrhh.catalogos si no existe; no concede permisos a ningún rol',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'rrhh-catalogos-modulo',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'seed modulo rrhh.catalogos',
            sql: `INSERT INTO "public"."modulo" (clave, nombre, grupo, ruta, orden, admite_aprobar, admite_anular) VALUES ('rrhh.catalogos', 'Catálogos de RR.HH.', 'RR.HH.', '/rrhh/catalogos', 40, false, false) ON CONFLICT (clave) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify modulo rrhh.catalogos',
            sql: `SELECT EXISTS (SELECT 1 FROM "public"."modulo" WHERE clave = 'rrhh.catalogos') AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
