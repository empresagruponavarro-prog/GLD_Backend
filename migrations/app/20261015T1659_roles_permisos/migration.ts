#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/03999aaba285f1f70263a03303adb61b7375d403cab165f80265644047fa622f/contract';
import endContract from '../../snapshots/03999aaba285f1f70263a03303adb61b7375d403cab165f80265644047fa622f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7d5f5baa87e6fee19d4133888ac7fe63daf16d060e663126fa0ba8b179b4bb38/contract';
import startContract from '../../snapshots/7d5f5baa87e6fee19d4133888ac7fe63daf16d060e663126fa0ba8b179b4bb38/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Catálogo inicial de módulos (plan 05-roles-y-permisos §5), en orden. `orden` = posición (1..n).
 * Debe coincidir con `CLAVES_MODULO` (src/platform/auth/permisos.ts); lo verifica permisos.spec.ts.
 * [clave, nombre, grupo, ruta, admite_aprobar, admite_anular]
 */
const MODULOS: ReadonlyArray<readonly [string, string, string, string, boolean, boolean]> = [
  ['dashboard', 'Dashboard situacional', 'Navegación', '/dashboard-situacional', false, false],
  ['modulos', 'Módulos principal', 'Navegación', '/modulos', false, false],
  ['incidencias', 'Registro de incidencias', 'Operaciones', '/incidencias', false, false],
  ['documentos.administracion', 'Compromisos de pago', 'Documentos', '/documentos/administracion', true, true],
  ['documentos.origen', 'Órdenes de compra', 'Documentos', '/documentos/origen', false, true],
  ['requerimientos', 'Requerimientos (FUR)', 'Documentos', '/requerimientos', false, false],
  ['requerimientos.aprobacion', 'Aprobaciones', 'Documentos', '/requerimientos/aprobacion', true, false],
  ['tesoreria.consulta', 'Consulta y tablero', 'Tesorería', '/tesoreria/consulta', false, false],
  ['tesoreria.programacion', 'Programación de pagos', 'Tesorería', '/tesoreria/programacion', false, true],
  ['tesoreria.pagos', 'Ejecución de pagos', 'Tesorería', '/tesoreria/pagos', false, true],
  ['tesoreria.cuentas', 'Cuentas de pago', 'Tesorería', '/tesoreria/cuentas', false, false],
  ['tesoreria.tipo-cambio', 'Tipo de cambio', 'Tesorería', '/tesoreria/tipo-cambio', false, false],
  ['almacen.consulta', 'Consulta', 'Almacén', '/almacen/consulta', false, false],
  ['almacen.stock', 'Stock actual', 'Almacén', '/almacen/stock', false, false],
  ['almacen.recepciones', 'Recepción de compras', 'Almacén', '/almacen/recepciones', false, true],
  ['almacen.ingresos', 'Entradas', 'Almacén', '/almacen/ingresos', false, true],
  ['almacen.salidas', 'Salidas', 'Almacén', '/almacen/salidas', false, true],
  ['almacen.transferencias', 'Transferencias', 'Almacén', '/almacen/transferencias', false, true],
  ['almacen.prestamos', 'Préstamos de equipos', 'Almacén', '/almacen/prestamos', false, true],
  ['almacen.kardex', 'Kardex', 'Almacén', '/almacen/kardex', false, false],
  ['almacen.inventario-inicial', 'Inventario inicial', 'Almacén', '/almacen/inventario-inicial', false, true],
  ['almacen.almacenes', 'Almacenes', 'Almacén', '/almacen/almacenes', false, false],
  ['maestros.anexos', 'Anexos', 'Maestros', '/anexos', false, false],
  ['maestros.productos', 'Productos', 'Maestros', '/productos', false, false],
  ['maestros.areas', 'Áreas', 'Maestros', '/maestros-generales/areas', false, false],
  ['maestros.generales', 'Maestros generales (categorías, unidades, especialidades, tipo doc.)', 'Maestros', '/maestros-generales', false, false],
  ['centros-costos', 'Centros de costos', 'Proyectos', '/centros-costos', false, false],
  ['obra', 'Datos de obra (cockpit)', 'Proyectos', '/centros-costos/:id/datos', false, false],
  ['presupuestos', 'Presupuestos', 'Proyectos', '/presupuestos', false, false],
  ['presupuestos.plantillas', 'Plantillas', 'Proyectos', '/presupuestos/plantillas', false, false],
  ['admin.empresas', 'Empresas', 'Administración', '/admin/empresas', false, false],
  ['admin.usuarios', 'Usuarios', 'Administración', '/admin/usuarios', false, false],
  ['admin.roles', 'Roles y permisos', 'Administración', '/admin/roles', false, false],
];

const texto = (valor: string) => `'${valor.replaceAll("'", "''")}'`;

const VALORES_MODULOS = MODULOS.map(
  ([clave, nombre, grupo, ruta, aprobar, anular], i) =>
    `(${texto(clave)}, ${texto(nombre)}, ${texto(grupo)}, ${texto(ruta)}, ${i + 1}, ${aprobar}, ${anular})`,
).join(', ');

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'modulo',
        columns: [
          col('activo', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('admite_anular', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('admite_aprobar', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('clave', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('grupo', 'character varying(60)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('orden', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ruta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'rol_permiso',
        columns: [
          col('anular', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('aprobar', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('crear', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('editar', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('eliminar', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('modulo_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('rol_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ver', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'usuarios',
        column: col('activo', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'modulo',
        constraint: 'modulo_clave_key',
        columns: ['clave'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'rol_permiso',
        constraint: 'rol_permiso_rol_id_modulo_id_key',
        columns: ['rol_id', 'modulo_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'rol_permiso',
        index: 'rol_permiso_modulo_id_idx_610f44c7',
        columns: ['modulo_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'rol_permiso',
        index: 'rol_permiso_rol_id_idx_369fac19',
        columns: ['rol_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'rol_permiso',
        foreignKey: {
          name: 'rol_permiso_rol_id_fkey',
          columns: ['rol_id'],
          references: { schema: 'public', table: 'rol', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'rol_permiso',
        foreignKey: {
          name: 'rol_permiso_modulo_id_fkey',
          columns: ['modulo_id'],
          references: { schema: 'public', table: 'modulo', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      // Semilla idempotente del catálogo de módulos (§5). ON CONFLICT no pisa cambios posteriores.
      rawSql({
        id: 'data.modulo.semilla',
        label: 'Semilla del catalogo de modulos',
        summary: `Inserta los ${MODULOS.length} módulos del plan 05-roles-y-permisos §5 si no existen`,
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'seed modulos',
            sql: `INSERT INTO "public"."modulo" (clave, nombre, grupo, ruta, orden, admite_aprobar, admite_anular) VALUES ${VALORES_MODULOS} ON CONFLICT (clave) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify modulos seeded',
            sql: `SELECT (SELECT count(*) FROM "public"."modulo") >= ${MODULOS.length} AS "result"`,
            params: [],
          },
        ],
      }),
      // D5: los roles existentes que no son de sistema quedan con todo permitido salvo Administración
      // (aprobar/anular solo donde el módulo lo admite). El Administrador no necesita filas.
      rawSql({
        id: 'data.rol_permiso.semilla',
        label: 'Semilla de permisos de los roles existentes',
        summary: 'Roles existentes (no de sistema): todo permitido salvo el grupo Administración',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'rol_permiso' } },
        precheck: [],
        execute: [
          {
            description: 'seed rol_permiso',
            sql: [
              'INSERT INTO "public"."rol_permiso" (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular)',
              'SELECT r.id, m.id, true, true, true, true, m.admite_aprobar, m.admite_anular',
              'FROM "public"."rol" r CROSS JOIN "public"."modulo" m',
              "WHERE r.es_sistema = false AND m.grupo <> 'Administración'",
              'ON CONFLICT (rol_id, modulo_id) DO NOTHING',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
