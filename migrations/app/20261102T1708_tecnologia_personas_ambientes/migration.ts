#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract';
import endContract from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract.json' with { type: 'json' };
import startContract from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Completa el grupo «Inv. Tecnología» (órdenes 37 y 38): «Personas» (hoy colgaba de maestros.anexos) y
 * «Ambientes y ubicaciones» (hoy colgaba de maestros.generales). Cada rol, área y excepción personal
 * conserva lo que ya tenía: se copia del módulo de origen al nuevo.
 */
const ORIGEN = `CASE m.clave WHEN 'tecnologia.personas' THEN 'maestros.anexos' ELSE 'maestros.generales' END`;
const NUEVOS = `('tecnologia.personas', 'tecnologia.ambientes')`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.modulo.tecnologia2',
        label: 'Semilla de los módulos Personas y Ambientes de Inv. Tecnología',
        summary: 'Inserta los módulos tecnologia.personas y tecnologia.ambientes si no existen',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'tecnologia-personas-ambientes',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'seed modulos tecnologia (personas, ambientes)',
            sql: `INSERT INTO "public"."modulo" (clave, nombre, grupo, ruta, orden, admite_aprobar, admite_anular) VALUES ('tecnologia.personas', 'Personas', 'Inv. Tecnología', '/personas', 37, false, false), ('tecnologia.ambientes', 'Ambientes y ubicaciones', 'Inv. Tecnología', '/maestros-generales/locales', 38, false, false) ON CONFLICT (clave) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify modulos tecnologia (personas, ambientes)',
            sql: `SELECT (SELECT count(*) FROM "public"."modulo" WHERE clave IN ${NUEVOS}) = 2 AS "result"`,
            params: [],
          },
        ],
      }),
      rawSql({
        id: 'data.rol_permiso.tecnologia2',
        label: 'Permisos de roles en Personas y Ambientes',
        summary: 'Copia a los módulos nuevos lo que cada rol ya tiene en el módulo del que salen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'rol_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'copiar rol_permiso',
            sql: `INSERT INTO "public"."rol_permiso" (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) SELECT rp.rol_id, m.id, rp.ver, rp.crear, rp.editar, rp.eliminar, false, false FROM "public"."modulo" m JOIN "public"."modulo" origen ON origen.clave = ${ORIGEN} JOIN "public"."rol_permiso" rp ON rp.modulo_id = origen.id WHERE m.clave IN ${NUEVOS} ON CONFLICT (rol_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.usuario_permiso.tecnologia2',
        label: 'Excepciones personales en Personas y Ambientes',
        summary: 'Copia a los módulos nuevos las excepciones que cada persona ya tiene en el módulo de origen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'usuario_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'copiar usuario_permiso',
            sql: `INSERT INTO "public"."usuario_permiso" (usuario_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) SELECT up.usuario_id, m.id, up.ver, up.crear, up.editar, up.eliminar, false, false FROM "public"."modulo" m JOIN "public"."modulo" origen ON origen.clave = ${ORIGEN} JOIN "public"."usuario_permiso" up ON up.modulo_id = origen.id WHERE m.clave IN ${NUEVOS} ON CONFLICT (usuario_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.area_modulo.tecnologia2',
        label: 'Personas y Ambientes habilitados por área',
        summary: 'Habilita en los módulos nuevos a las áreas que ya tienen habilitado el módulo de origen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'area_modulo' } },
        precheck: [],
        execute: [
          {
            description: 'copiar area_modulo',
            sql: `INSERT INTO "public"."area_modulo" (area_id, modulo_id, solo_lectura) SELECT am.area_id, m.id, am.solo_lectura FROM "public"."modulo" m JOIN "public"."modulo" origen ON origen.clave = ${ORIGEN} JOIN "public"."area_modulo" am ON am.modulo_id = origen.id WHERE m.clave IN ${NUEVOS} ON CONFLICT (area_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
