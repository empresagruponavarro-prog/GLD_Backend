#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/19e91f26d3957aa82fbdb26ed53e1a5016fffce35dd25673ee5407384fce52ca/contract';
import endContract from '../../snapshots/19e91f26d3957aa82fbdb26ed53e1a5016fffce35dd25673ee5407384fce52ca/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4ada217dde77de1c97fc3f38b647aa59c886e577f9d6fa7954ae829842fa2fc9/contract';
import startContract from '../../snapshots/4ada217dde77de1c97fc3f38b647aa59c886e577f9d6fa7954ae829842fa2fc9/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
} from '@prisma/orm-postgres/migration';

/**
 * Plan 12 · Valorizaciones de contratistas — esquema y datos que lo acompañan (todo idempotente, en el mismo paquete: las
 * migraciones de datos `from = to` no corren con `db migrate --to <hash>`).
 *  - Módulos de permisos `valorizaciones` (43.º) y `valorizaciones.administracion` (44.º), sin permisos por defecto.
 *  - Serie de correlativo `VAL` (sin ella `siguienteNumero` responde 404).
 *  - Condiciones por defecto por tipo de servicio: generales 15 % / 10 % / 3 valorizaciones / 3 meses, y adelanto propio de drywall (20 %),
 *    instalaciones eléctricas (15 %) y pintura (15 %). Se buscan por la descripción de la categoría del catálogo.
 */
const dato = (id: string, label: string, tabla: string, sql: string[], postcheck: string) =>
  rawSql({
    id,
    label,
    summary: label,
    operationClass: 'data',
    target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: tabla } },
    precheck: [],
    execute: sql.map((s) => ({ description: label, sql: s, params: [] })),
    postcheck: [{ description: `verify ${label}`, sql: postcheck, params: [] }],
  });

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'condicion_servicio',
        columns: [
          col('adelanto_porcentaje', 'numeric', {
            notNull: true,
            default: lit('15'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('condiciones_comerciales', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('condiciones_generales', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('dias_credito', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('forma_pago', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('garantia_porcentaje', 'numeric', {
            notNull: true,
            default: lit('10'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('meses_garantia', 'int4', {
            notNull: true,
            default: lit(3),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('numero_valorizaciones', 'int4', {
            notNull: true,
            default: lit(3),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'contrato_valorizacion',
        columns: [
          col('adelanto_porcentaje', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('alcances', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('condiciones_comerciales', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('condiciones_generales', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('estado', 'text', {
            notNull: true,
            default: lit('BORRADOR'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('fecha_primera', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('garantia_porcentaje', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_documento_origen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_supervisor', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('liquidado_en', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('meses_garantia', 'int4', {
            notNull: true,
            default: lit(3),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('numero_valorizaciones', 'int4', {
            notNull: true,
            default: lit(3),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('registrado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('visto_administracion_en', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('visto_administracion_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('visto_operaciones_en', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('visto_operaciones_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'contrato_valorizacion_estado_check_7819e2d6',
            "\"estado\" IN ('BORRADOR', 'VIGENTE', 'LIQUIDADO', 'ANULADO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'deductivo_proveedor',
        columns: [
          col('cantidad', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('descripcion', 'character varying(300)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 300 } },
          }),
          col('estado', 'text', {
            notNull: true,
            default: lit('PENDIENTE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('fecha', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_almacen_detalle', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_documento_origen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_obra_incidencia', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('monto', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('motivo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('motivo_anulacion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('registrado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('sustento_url', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'deductivo_proveedor_estado_check_391cc846',
            "\"estado\" IN ('PENDIENTE', 'APLICADO', 'ANULADO')",
          ),
          checkExpression(
            'deductivo_proveedor_motivo_check_949afadb',
            "\"motivo\" IN ('MATERIAL', 'INCIDENCIA', 'PENALIDAD', 'INCUMPLIMIENTO', 'APOYO', 'ADICIONAL', 'OTRO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'valorizacion',
        columns: [
          col('amortizacion', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('anulado_en', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('anulado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('aprobado_en', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('aprobado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('avance_pct', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('descuentos', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('detraccion', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('detraccion_soles', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('estado', 'text', {
            notNull: true,
            default: lit('BORRADOR'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('factura_fecha', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('factura_numero', 'character varying(30)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('factura_url', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('facturable', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('fecha_corte', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('garantia', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_contrato', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('motivo_anulacion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('motivo_monto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('neto', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('numero', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('numero_documento', 'character varying(20)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('origen_monto', 'text', {
            notNull: true,
            default: lit('PLAN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('registrado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('renta_4ta', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('retencion_igv', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('tipo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('valorizado', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('vigente', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'valorizacion_estado_check_780a42b8',
            "\"estado\" IN ('BORRADOR', 'APROBADA', 'ANULADA')",
          ),
          checkExpression(
            'valorizacion_origen_monto_check_a9336a8b',
            "\"origen_monto\" IN ('PLAN', 'AVANCE', 'SUPERVISOR')",
          ),
          checkExpression(
            'valorizacion_tipo_check_1fc15f0d',
            "\"tipo\" IN ('ADELANTO', 'VALORIZACION', 'GARANTIA')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'valorizacion_deductivo',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_deductivo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_valorizacion', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('monto', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'valorizacion_linea',
        columns: [
          col('avance_acumulado', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('avance_manual', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_orden_detalle', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_valorizacion', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('monto_anterior', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('monto_presente', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'pago_programado',
        column: col('id_valorizacion', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'condicion_servicio',
        constraint: 'condicion_servicio_id_categoria_key',
        columns: ['id_categoria'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'contrato_valorizacion',
        constraint: 'contrato_valorizacion_id_documento_origen_key',
        columns: ['id_documento_origen'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'valorizacion',
        constraint: 'valorizacion_numero_documento_key',
        columns: ['numero_documento'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'valorizacion',
        constraint: 'valorizacion_id_contrato_tipo_numero_vigente_key',
        columns: ['id_contrato', 'tipo', 'numero', 'vigente'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'valorizacion_deductivo',
        constraint: 'valorizacion_deductivo_id_valorizacion_id_deductivo_key',
        columns: ['id_valorizacion', 'id_deductivo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'contrato_valorizacion',
        index: 'contrato_valorizacion_id_supervisor_idx_0dfc7298',
        columns: ['id_supervisor'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'deductivo_proveedor',
        index: 'deductivo_proveedor_id_almacen_detalle_idx_5721fa31',
        columns: ['id_almacen_detalle'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'deductivo_proveedor',
        index: 'deductivo_proveedor_id_documento_origen_idx_90e8b67c',
        columns: ['id_documento_origen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'deductivo_proveedor',
        index: 'deductivo_proveedor_id_obra_incidencia_idx_fe4f8ed6',
        columns: ['id_obra_incidencia'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pago_programado',
        index: 'pago_programado_id_valorizacion_idx_5f92de6f',
        columns: ['id_valorizacion'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'valorizacion',
        index: 'valorizacion_id_contrato_idx_a1795884',
        columns: ['id_contrato'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'valorizacion_deductivo',
        index: 'valorizacion_deductivo_id_deductivo_idx_a532faa2',
        columns: ['id_deductivo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'valorizacion_deductivo',
        index: 'valorizacion_deductivo_id_valorizacion_idx_5f92de6f',
        columns: ['id_valorizacion'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'valorizacion_linea',
        index: 'valorizacion_linea_id_orden_detalle_idx_af29857d',
        columns: ['id_orden_detalle'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'valorizacion_linea',
        index: 'valorizacion_linea_id_valorizacion_idx_5f92de6f',
        columns: ['id_valorizacion'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'condicion_servicio',
        foreignKey: {
          name: 'condicion_servicio_id_categoria_fkey',
          columns: ['id_categoria'],
          references: { schema: 'public', table: 'categoria', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'contrato_valorizacion',
        foreignKey: {
          name: 'contrato_valorizacion_id_documento_origen_fkey',
          columns: ['id_documento_origen'],
          references: { schema: 'public', table: 'documentosOrigen', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'contrato_valorizacion',
        foreignKey: {
          name: 'contrato_valorizacion_id_supervisor_fkey',
          columns: ['id_supervisor'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'deductivo_proveedor',
        foreignKey: {
          name: 'deductivo_proveedor_id_documento_origen_fkey',
          columns: ['id_documento_origen'],
          references: { schema: 'public', table: 'documentosOrigen', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'deductivo_proveedor',
        foreignKey: {
          name: 'deductivo_proveedor_id_almacen_detalle_fkey',
          columns: ['id_almacen_detalle'],
          references: { schema: 'public', table: 'almacen_documento_detalle', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'deductivo_proveedor',
        foreignKey: {
          name: 'deductivo_proveedor_id_obra_incidencia_fkey',
          columns: ['id_obra_incidencia'],
          references: { schema: 'public', table: 'obra_incidencias_rfi', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'valorizacion',
        foreignKey: {
          name: 'valorizacion_id_contrato_fkey',
          columns: ['id_contrato'],
          references: { schema: 'public', table: 'contrato_valorizacion', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pago_programado',
        foreignKey: {
          name: 'pago_programado_id_valorizacion_fkey',
          columns: ['id_valorizacion'],
          references: { schema: 'public', table: 'valorizacion', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'valorizacion_deductivo',
        foreignKey: {
          name: 'valorizacion_deductivo_id_valorizacion_fkey',
          columns: ['id_valorizacion'],
          references: { schema: 'public', table: 'valorizacion', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'valorizacion_deductivo',
        foreignKey: {
          name: 'valorizacion_deductivo_id_deductivo_fkey',
          columns: ['id_deductivo'],
          references: { schema: 'public', table: 'deductivo_proveedor', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'valorizacion_linea',
        foreignKey: {
          name: 'valorizacion_linea_id_valorizacion_fkey',
          columns: ['id_valorizacion'],
          references: { schema: 'public', table: 'valorizacion', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'valorizacion_linea',
        foreignKey: {
          name: 'valorizacion_linea_id_orden_detalle_fkey',
          columns: ['id_orden_detalle'],
          references: { schema: 'public', table: 'ordenCompraDetalle', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      dato(
        'data.modulo.valorizaciones',
        'Módulos «Valorizaciones» y «Condiciones y garantías»; sin permisos por defecto: solo el Administrador',
        'modulo',
        [
          `INSERT INTO "public"."modulo" ("clave", "nombre", "grupo", "ruta", "orden", "admite_aprobar", "admite_anular")
         VALUES ('valorizaciones', 'Valorizaciones', 'Documentos', '/valorizaciones/semana', 43, true, true), ('valorizaciones.administracion', 'Condiciones y garantías', 'Documentos', '/valorizaciones/condiciones', 44, true, false)
         ON CONFLICT ("clave") DO NOTHING`,
        ],
        `SELECT (SELECT count(*) FROM "public"."modulo" WHERE "clave" IN ('valorizaciones', 'valorizaciones.administracion')) = 2 AS "result"`,
      ),
      dato(
        'data.correlativo.valorizaciones',
        'Serie de correlativo VAL (valorizaciones)',
        'almacen_correlativo',
        [`INSERT INTO "public"."almacen_correlativo" (serie, ultimo) VALUES ('VAL', 0) ON CONFLICT (serie) DO NOTHING`],
        `SELECT EXISTS (SELECT 1 FROM "public"."almacen_correlativo" WHERE serie = 'VAL') AS "result"`,
      ),
      dato(
        'data.condicion_servicio.semilla',
        'Condiciones por defecto de los contratistas: generales y por tipo de servicio',
        'condicion_servicio',
        [
          `INSERT INTO "public"."condicion_servicio" ("id_categoria", "adelanto_porcentaje", "garantia_porcentaje", "numero_valorizaciones", "meses_garantia")
         SELECT NULL::int, 15, 10, 3, 3 WHERE NOT EXISTS (SELECT 1 FROM "public"."condicion_servicio" WHERE "id_categoria" IS NULL)`,
          `INSERT INTO "public"."condicion_servicio" ("id_categoria", "adelanto_porcentaje", "garantia_porcentaje", "numero_valorizaciones", "meses_garantia")
         SELECT c."id", v."adelanto", 10, 3, 3
           FROM "public"."categoria" c
           JOIN (VALUES ('4. CD - DRYWALL%', 20), ('7. CD - ELECTRICAS%', 15), ('5. CD - PINTURA%', 15)) AS v("patron", "adelanto") ON c."descripcion" LIKE v."patron"
         ON CONFLICT ("id_categoria") DO NOTHING`,
        ],
        `SELECT EXISTS (SELECT 1 FROM "public"."condicion_servicio" WHERE "id_categoria" IS NULL) AS "result"`,
      ),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
