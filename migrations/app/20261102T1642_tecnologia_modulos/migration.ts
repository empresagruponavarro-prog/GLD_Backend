#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract';
import endContract from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract.json' with { type: 'json' };
import startContract from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Los equipos tecnológicos dejan de colgar del módulo «Anexos» y pasan a dos módulos propios del grupo
 * «Inv. Tecnología» (órdenes 35 y 36): el tablero de lectura y el mantenimiento. Para que nadie pierda el
 * acceso que ya tenía, cada rol, área y excepción personal que hoy tiene `maestros.anexos` recibe lo mismo
 * en los módulos nuevos (el tablero solo necesita «ver»).
 */
const NUEVOS = `('tecnologia.dashboard', 'tecnologia.mantenimiento')`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.modulo.tecnologia',
        label: 'Semilla de los módulos de Inv. Tecnología',
        summary: 'Inserta los módulos tecnologia.dashboard y tecnologia.mantenimiento si no existen',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'tecnologia-modulos',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'seed modulos tecnologia',
            sql: `INSERT INTO "public"."modulo" (clave, nombre, grupo, ruta, orden, admite_aprobar, admite_anular) VALUES ('tecnologia.dashboard', 'Dashboard de tecnología', 'Inv. Tecnología', '/equipos-tecnologicos', 35, false, false), ('tecnologia.mantenimiento', 'Mantenimiento de equipos', 'Inv. Tecnología', '/equipos-mantenimiento', 36, false, false) ON CONFLICT (clave) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify modulos tecnologia',
            sql: `SELECT (SELECT count(*) FROM "public"."modulo" WHERE clave IN ${NUEVOS}) = 2 AS "result"`,
            params: [],
          },
        ],
      }),
      rawSql({
        id: 'data.rol_permiso.tecnologia',
        label: 'Permisos de roles en los módulos de Inv. Tecnología',
        summary: 'Copia a los módulos nuevos lo que cada rol ya tiene en maestros.anexos (el tablero solo «ver»)',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'rol_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'copiar rol_permiso de maestros.anexos',
            sql: `INSERT INTO "public"."rol_permiso" (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) SELECT rp.rol_id, m.id, rp.ver, (rp.crear AND m.clave = 'tecnologia.mantenimiento'), (rp.editar AND m.clave = 'tecnologia.mantenimiento'), (rp.eliminar AND m.clave = 'tecnologia.mantenimiento'), false, false FROM "public"."rol_permiso" rp JOIN "public"."modulo" origen ON origen.id = rp.modulo_id AND origen.clave = 'maestros.anexos' CROSS JOIN "public"."modulo" m WHERE m.clave IN ${NUEVOS} ON CONFLICT (rol_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.usuario_permiso.tecnologia',
        label: 'Excepciones personales en los módulos de Inv. Tecnología',
        summary: 'Copia a los módulos nuevos las excepciones que cada persona ya tiene en maestros.anexos',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'usuario_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'copiar usuario_permiso de maestros.anexos',
            sql: `INSERT INTO "public"."usuario_permiso" (usuario_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) SELECT up.usuario_id, m.id, up.ver, (up.crear AND m.clave = 'tecnologia.mantenimiento'), (up.editar AND m.clave = 'tecnologia.mantenimiento'), (up.eliminar AND m.clave = 'tecnologia.mantenimiento'), false, false FROM "public"."usuario_permiso" up JOIN "public"."modulo" origen ON origen.id = up.modulo_id AND origen.clave = 'maestros.anexos' CROSS JOIN "public"."modulo" m WHERE m.clave IN ${NUEVOS} ON CONFLICT (usuario_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.area_modulo.tecnologia',
        label: 'Módulos de Inv. Tecnología habilitados por área',
        summary: 'Habilita en los módulos nuevos a las áreas que ya tienen habilitado maestros.anexos',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'area_modulo' } },
        precheck: [],
        execute: [
          {
            description: 'copiar area_modulo de maestros.anexos',
            sql: `INSERT INTO "public"."area_modulo" (area_id, modulo_id, solo_lectura) SELECT am.area_id, m.id, am.solo_lectura FROM "public"."area_modulo" am JOIN "public"."modulo" origen ON origen.id = am.modulo_id AND origen.clave = 'maestros.anexos' CROSS JOIN "public"."modulo" m WHERE m.clave IN ${NUEVOS} ON CONFLICT (area_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
