#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/73e6fa47ad298b32c5cd5acc8de25f67f1ab9b97adb0541d5958b3e1fbd2ba29/contract';
import endContract from '../../snapshots/73e6fa47ad298b32c5cd5acc8de25f67f1ab9b97adb0541d5958b3e1fbd2ba29/contract.json' with { type: 'json' };
import startContract from '../../snapshots/73e6fa47ad298b32c5cd5acc8de25f67f1ab9b97adb0541d5958b3e1fbd2ba29/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * RR.HH. › Trabajadores (orden 39) reemplaza a «Personas» de Inv. Tecnología: quien ingresa los datos de
 * los trabajadores es RR.HH. Cada rol, área y excepción personal conserva lo que tenía en
 * `tecnologia.personas`, que queda desactivado (deja de verse en Roles y permisos; no se borra).
 * Idempotente: si el módulo o los permisos ya existen, no los toca.
 */
const ORIGEN = `(SELECT id FROM "public"."modulo" WHERE clave = 'tecnologia.personas')`;
const DESTINO = `(SELECT id FROM "public"."modulo" WHERE clave = 'rrhh.trabajadores')`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.modulo.rrhh.trabajadores',
        label: 'Semilla del módulo RR.HH. › Trabajadores',
        summary: 'Inserta el módulo rrhh.trabajadores si no existe',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'rrhh-trabajadores',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'seed modulo rrhh.trabajadores',
            sql: `INSERT INTO "public"."modulo" (clave, nombre, grupo, ruta, orden, admite_aprobar, admite_anular) VALUES ('rrhh.trabajadores', 'Trabajadores', 'RR.HH.', '/rrhh/trabajadores', 39, false, false) ON CONFLICT (clave) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify modulo rrhh.trabajadores',
            sql: `SELECT EXISTS (SELECT 1 FROM "public"."modulo" WHERE clave = 'rrhh.trabajadores') AS "result"`,
            params: [],
          },
        ],
      }),
      rawSql({
        id: 'data.rol_permiso.rrhh.trabajadores',
        label: 'Permisos de roles en RR.HH. › Trabajadores',
        summary: 'Copia a rrhh.trabajadores lo que cada rol tenía en tecnologia.personas',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'rol_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'copiar rol_permiso de tecnologia.personas',
            sql: `INSERT INTO "public"."rol_permiso" (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) SELECT rp.rol_id, ${DESTINO}, rp.ver, rp.crear, rp.editar, rp.eliminar, false, false FROM "public"."rol_permiso" rp WHERE rp.modulo_id = ${ORIGEN} ON CONFLICT (rol_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.usuario_permiso.rrhh.trabajadores',
        label: 'Excepciones personales en RR.HH. › Trabajadores',
        summary: 'Copia a rrhh.trabajadores las excepciones que cada persona tenía en tecnologia.personas',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'usuario_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'copiar usuario_permiso de tecnologia.personas',
            sql: `INSERT INTO "public"."usuario_permiso" (usuario_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) SELECT up.usuario_id, ${DESTINO}, up.ver, up.crear, up.editar, up.eliminar, false, false FROM "public"."usuario_permiso" up WHERE up.modulo_id = ${ORIGEN} ON CONFLICT (usuario_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.area_modulo.rrhh.trabajadores',
        label: 'RR.HH. › Trabajadores habilitado por área',
        summary: 'Habilita rrhh.trabajadores en las áreas que tenían habilitado tecnologia.personas',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'area_modulo' } },
        precheck: [],
        execute: [
          {
            description: 'copiar area_modulo de tecnologia.personas',
            sql: `INSERT INTO "public"."area_modulo" (area_id, modulo_id, solo_lectura) SELECT am.area_id, ${DESTINO}, am.solo_lectura FROM "public"."area_modulo" am WHERE am.modulo_id = ${ORIGEN} ON CONFLICT (area_id, modulo_id) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      rawSql({
        id: 'data.modulo.tecnologia.personas.desactivar',
        label: 'Desactivar Inv. Tecnología › Personas',
        summary: 'tecnologia.personas deja de mostrarse en Roles y permisos (lo reemplaza rrhh.trabajadores)',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'desactivar tecnologia.personas',
            sql: `UPDATE "public"."modulo" SET activo = false WHERE clave = 'tecnologia.personas'`,
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
