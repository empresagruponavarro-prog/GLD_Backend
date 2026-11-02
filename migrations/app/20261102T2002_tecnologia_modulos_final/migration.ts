#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/8f4cf05305c3d9983e6dac2ea57d01bcef1c44e028d6f87413420627874c5d29/contract';
import endContract from '../../snapshots/8f4cf05305c3d9983e6dac2ea57d01bcef1c44e028d6f87413420627874c5d29/contract.json' with { type: 'json' };
import startContract from '../../snapshots/8f4cf05305c3d9983e6dac2ea57d01bcef1c44e028d6f87413420627874c5d29/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Módulos del grupo «Inv. Tecnología» (órdenes 35 a 38), todo en una sola migración de datos IDEMPOTENTE
 * y ubicada al final del grafo. Reúne lo de `20261102T1642_tecnologia_modulos` y
 * `20261102T1708_tecnologia_personas_ambientes`, que quedaron antes de `20261102T1715_areas_descripcion_jefe`
 * y por eso un entorno que ya pasó de ese punto no puede cumplir sus invariantes. Si los módulos o los
 * permisos ya existen (entornos donde esas dos migraciones sí corrieron) no hace nada (ON CONFLICT DO NOTHING).
 *
 * Cada rol, área y excepción personal conserva lo que ya tenía: el dashboard, el mantenimiento y las
 * personas salen de `maestros.anexos`; los ambientes, de `maestros.generales`. El dashboard solo recibe «ver».
 */
const NUEVOS = `('tecnologia.dashboard', 'tecnologia.mantenimiento', 'tecnologia.personas', 'tecnologia.ambientes')`;
const ORIGEN = `CASE m.clave WHEN 'tecnologia.ambientes' THEN 'maestros.generales' ELSE 'maestros.anexos' END`;
const SOLO_VER = `m.clave = 'tecnologia.dashboard'`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.modulo.tecnologia.final',
        label: 'Semilla de los 4 módulos de Inv. Tecnología',
        summary: 'Inserta tecnologia.dashboard, .mantenimiento, .personas y .ambientes si no existen',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'tecnologia-modulos-final',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'seed modulos tecnologia',
            sql: `INSERT INTO "public"."modulo" (clave, nombre, grupo, ruta, orden, admite_aprobar, admite_anular) VALUES ('tecnologia.dashboard', 'Dashboard de tecnología', 'Inv. Tecnología', '/equipos-tecnologicos', 35, false, false), ('tecnologia.mantenimiento', 'Mantenimiento de equipos', 'Inv. Tecnología', '/equipos-mantenimiento', 36, false, false), ('tecnologia.personas', 'Personas', 'Inv. Tecnología', '/personas', 37, false, false), ('tecnologia.ambientes', 'Ambientes y ubicaciones', 'Inv. Tecnología', '/maestros-generales/locales', 38, false, false) ON CONFLICT (clave) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify modulos tecnologia',
            sql: `SELECT (SELECT count(*) FROM "public"."modulo" WHERE clave IN ${NUEVOS}) = 4 AS "result"`,
            params: [],
          },
        ],
      }),
      rawSql({
        id: 'data.rol_permiso.tecnologia.final',
        label: 'Permisos de roles en los módulos de Inv. Tecnología',
        summary: 'Copia a los módulos nuevos lo que cada rol ya tiene en el módulo del que salen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'rol_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'copiar rol_permiso',
            sql: `INSERT INTO "public"."rol_permiso" (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) SELECT rp.rol_id, m.id, rp.ver, (rp.crear AND NOT (${SOLO_VER})), (rp.editar AND NOT (${SOLO_VER})), (rp.eliminar AND NOT (${SOLO_VER})), false, false FROM "public"."modulo" m JOIN "public"."modulo" origen ON origen.clave = ${ORIGEN} JOIN "public"."rol_permiso" rp ON rp.modulo_id = origen.id WHERE m.clave IN ${NUEVOS} ON CONFLICT (rol_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.usuario_permiso.tecnologia.final',
        label: 'Excepciones personales en los módulos de Inv. Tecnología',
        summary: 'Copia a los módulos nuevos las excepciones que cada persona ya tiene en el módulo de origen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'usuario_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'copiar usuario_permiso',
            sql: `INSERT INTO "public"."usuario_permiso" (usuario_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) SELECT up.usuario_id, m.id, up.ver, (up.crear AND NOT (${SOLO_VER})), (up.editar AND NOT (${SOLO_VER})), (up.eliminar AND NOT (${SOLO_VER})), false, false FROM "public"."modulo" m JOIN "public"."modulo" origen ON origen.clave = ${ORIGEN} JOIN "public"."usuario_permiso" up ON up.modulo_id = origen.id WHERE m.clave IN ${NUEVOS} ON CONFLICT (usuario_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.area_modulo.tecnologia.final',
        label: 'Módulos de Inv. Tecnología habilitados por área',
        summary: 'Habilita en los módulos nuevos a las áreas que ya tienen habilitado el módulo de origen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'area_modulo' } },
        precheck: [],
        execute: [
          {
            description: 'copiar area_modulo',
            sql: `INSERT INTO "public"."area_modulo" (area_id, modulo_id, solo_lectura) SELECT am.area_id, m.id, (am.solo_lectura OR ${SOLO_VER}) FROM "public"."modulo" m JOIN "public"."modulo" origen ON origen.clave = ${ORIGEN} JOIN "public"."area_modulo" am ON am.modulo_id = origen.id WHERE m.clave IN ${NUEVOS} ON CONFLICT (area_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
