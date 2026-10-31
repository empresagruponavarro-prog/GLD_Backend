#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/bf4c8d176845184481328c4d6f75af576bf144d3dc4531ca678d65b21b05a7ac/contract';
import startContract from '../../snapshots/bf4c8d176845184481328c4d6f75af576bf144d3dc4531ca678d65b21b05a7ac/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e70f0760959348560d5dcc8370aec2544a0b321e39fe0f16a140d845950a4734/contract';
import endContract from '../../snapshots/e70f0760959348560d5dcc8370aec2544a0b321e39fe0f16a140d845950a4734/contract.json' with { type: 'json' };
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

/** [tabla, nombre, expresión]: reglas de rango que el contrato no expresa. */
const CHECKS: ReadonlyArray<readonly [string, string, string]> = [
  ['obra_subpartida', 'obra_subpartida_fechas_check', '"fecha_fin" >= "fecha_inicio"'],
  ['obra_subpartida_semana', 'obra_subpartida_semana_numero_check', '"numero_semana" BETWEEN 1 AND 16'],
  ['obra_subpartida_semana', 'obra_subpartida_semana_meta_check', '"meta" IS NULL OR ("meta" BETWEEN 0 AND 100 AND "numero_semana" <= 10)'],
  ['obra_subpartida_semana', 'obra_subpartida_semana_avance_check', '"avance" IS NULL OR "avance" BETWEEN 0 AND 100'],
  ['obra_reprogramacion', 'obra_reprogramacion_dias_check', '"dias" BETWEEN 1 AND 60'],
  ['obra_evento', 'obra_evento_severidad_check', `"severidad" IN ('info', 'good', 'warn', 'crit')`],
  ['obra_datos_generales', 'obra_datos_generales_avance_check', '"avance_general" IS NULL OR "avance_general" BETWEEN 0 AND 100'],
  ['obra_datos_generales', 'obra_datos_generales_postventa_check', '"plazo_postventa_dias" IS NULL OR "plazo_postventa_dias" BETWEEN 1 AND 365'],
];

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'obra_evento',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('detalle', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('severidad', 'character varying(10)', {
            notNull: true,
            default: lit('info'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('tipo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('titulo', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('usuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('valor_antes', 'character varying(200)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('valor_despues', 'character varying(200)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'obra_evento_tipo_check_c24c3323',
            "\"tipo\" IN ('ALTA', 'ESTADO', 'AVANCE', 'PLAZO', 'EQUIPO', 'REPROGRAMACION', 'SITUACION', 'VENCIDO', 'SOBRECARGA')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_partida',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_ppto_detalle_fase', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('item', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('nombre', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('tipo', 'text', {
            notNull: true,
            default: lit('CONTRACTUAL'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'obra_partida_tipo_check_5f1b516a',
            "\"tipo\" IN ('CONTRACTUAL', 'ADICIONAL')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_reprogramacion',
        columns: [
          col('aprobado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('desde', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('detalle', 'character varying(160)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 160 } },
          }),
          col('dias', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('item_aplica', 'character varying(20)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('motivo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('registrado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'obra_reprogramacion_motivo_check_e44a3b71',
            "\"motivo\" IN ('CLIENTE', 'PERMISO_LICENCIA', 'PROVEEDOR_CLIENTE', 'FUERZA_MAYOR', 'INTERNO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_subpartida',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fecha_fin', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('fecha_inicio', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_partida', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_ppto_detalle_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('item', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('nombre', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('observacion', 'character varying(200)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('tipo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'obra_subpartida_tipo_check_5f1b516a',
            "\"tipo\" IN ('CONTRACTUAL', 'ADICIONAL')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_subpartida_semana',
        columns: [
          col('avance', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_subpartida', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('meta', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('numero_semana', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('registrado_en', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('registrado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('actualizado_por', 'character varying(255)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('avance_general', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('codigo_obra', 'character varying(30)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('comentario', 'character varying(200)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('estado_obra', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('fecha_cierre_postventa', 'date', {
          codecRef: { codecId: 'pg/date-string@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('id_coordinador', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('id_jefe_proyecto', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('id_presupuesto_origen', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('id_residente', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('id_resp_presupuesto', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('id_resp_procura', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('observaciones_postventa', 'character varying(200)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('plazo_postventa_dias', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_datos_generales',
        column: col('tienda', 'character varying(80)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_incidencias_rfi',
        column: col('id_subpartida', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'obra_datos_generales',
        constraint: 'obra_datos_generales_estado_obra_check_39c92be1',
        expression:
          "\"estado_obra\" IN ('PROXIMO', 'EN_EJECUCION', 'POST_VENTA', 'CULMINADO', 'SUSPENDIDA', 'CANCELADA')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'obra_datos_generales',
        constraint: 'obra_datos_generales_codigo_obra_key',
        columns: ['codigo_obra'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'obra_partida',
        constraint: 'obra_partida_id_centro_costo_item_key',
        columns: ['id_centro_costo', 'item'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'obra_subpartida',
        constraint: 'obra_subpartida_id_centro_costo_item_key',
        columns: ['id_centro_costo', 'item'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'obra_subpartida_semana',
        constraint: 'obra_subpartida_semana_id_subpartida_numero_semana_key',
        columns: ['id_subpartida', 'numero_semana'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_datos_generales',
        index: 'obra_datos_generales_estado_obra_idx_785b105f',
        columns: ['estado_obra'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_datos_generales',
        index: 'obra_datos_generales_id_coordinador_idx_3bc51f7a',
        columns: ['id_coordinador'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_datos_generales',
        index: 'obra_datos_generales_id_jefe_proyecto_idx_2a4e762a',
        columns: ['id_jefe_proyecto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_datos_generales',
        index: 'obra_datos_generales_id_presupuesto_origen_idx_fcbfb5fe',
        columns: ['id_presupuesto_origen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_datos_generales',
        index: 'obra_datos_generales_id_residente_idx_1562a6cf',
        columns: ['id_residente'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_datos_generales',
        index: 'obra_datos_generales_id_resp_presupuesto_idx_a1ae10e3',
        columns: ['id_resp_presupuesto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_datos_generales',
        index: 'obra_datos_generales_id_resp_procura_idx_cc407465',
        columns: ['id_resp_procura'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_evento',
        index: 'obra_evento_created_at_idx_225d8c0f',
        columns: ['created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_evento',
        index: 'obra_evento_id_centro_costo_created_at_idx_3daaebdb',
        columns: ['id_centro_costo', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_evento',
        index: 'obra_evento_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_incidencias_rfi',
        index: 'obra_incidencias_rfi_id_subpartida_idx_934aed61',
        columns: ['id_subpartida'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_partida',
        index: 'obra_partida_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_partida',
        index: 'obra_partida_id_centro_costo_orden_idx_183e9e95',
        columns: ['id_centro_costo', 'orden'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_partida',
        index: 'obra_partida_id_ppto_detalle_fase_idx_28f6cf4d',
        columns: ['id_ppto_detalle_fase'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_reprogramacion',
        index: 'obra_reprogramacion_id_centro_costo_desde_idx_981a070f',
        columns: ['id_centro_costo', 'desde'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_reprogramacion',
        index: 'obra_reprogramacion_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_subpartida',
        index: 'obra_subpartida_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_subpartida',
        index: 'obra_subpartida_id_partida_idx_e759d756',
        columns: ['id_partida'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_subpartida',
        index: 'obra_subpartida_id_ppto_detalle_categoria_idx_5963aa86',
        columns: ['id_ppto_detalle_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_subpartida_semana',
        index: 'obra_subpartida_semana_id_subpartida_idx_934aed61',
        columns: ['id_subpartida'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_datos_generales',
        foreignKey: {
          name: 'obra_datos_generales_id_coordinador_fkey',
          columns: ['id_coordinador'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_datos_generales',
        foreignKey: {
          name: 'obra_datos_generales_id_jefe_proyecto_fkey',
          columns: ['id_jefe_proyecto'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_datos_generales',
        foreignKey: {
          name: 'obra_datos_generales_id_presupuesto_origen_fkey',
          columns: ['id_presupuesto_origen'],
          references: { schema: 'public', table: 'ppto_Principal', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_datos_generales',
        foreignKey: {
          name: 'obra_datos_generales_id_residente_fkey',
          columns: ['id_residente'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_datos_generales',
        foreignKey: {
          name: 'obra_datos_generales_id_resp_presupuesto_fkey',
          columns: ['id_resp_presupuesto'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_datos_generales',
        foreignKey: {
          name: 'obra_datos_generales_id_resp_procura_fkey',
          columns: ['id_resp_procura'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_evento',
        foreignKey: {
          name: 'obra_evento_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_partida',
        foreignKey: {
          name: 'obra_partida_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_partida',
        foreignKey: {
          name: 'obra_partida_id_ppto_detalle_fase_fkey',
          columns: ['id_ppto_detalle_fase'],
          references: { schema: 'public', table: 'ppto_DetalleFases', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_reprogramacion',
        foreignKey: {
          name: 'obra_reprogramacion_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_subpartida',
        foreignKey: {
          name: 'obra_subpartida_id_partida_fkey',
          columns: ['id_partida'],
          references: { schema: 'public', table: 'obra_partida', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_subpartida',
        foreignKey: {
          name: 'obra_subpartida_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_subpartida',
        foreignKey: {
          name: 'obra_subpartida_id_ppto_detalle_categoria_fkey',
          columns: ['id_ppto_detalle_categoria'],
          references: { schema: 'public', table: 'ppto_DetalleFasesCate', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_incidencias_rfi',
        foreignKey: {
          name: 'obra_incidencias_rfi_id_subpartida_fkey',
          columns: ['id_subpartida'],
          references: { schema: 'public', table: 'obra_subpartida', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_subpartida_semana',
        foreignKey: {
          name: 'obra_subpartida_semana_id_subpartida_fkey',
          columns: ['id_subpartida'],
          references: { schema: 'public', table: 'obra_subpartida', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      // ---- CHECK numéricos (D3/D4/D8 del plan: reprogramación 1-60 d, metas 1-10, avance 1-16) ----
      ...CHECKS.map(([tabla, nombre, expresion]) =>
        rawSql({
          id: `check.${tabla}.${nombre}`,
          label: `Check ${nombre} en ${tabla}`,
          summary: `Agrega la restricción ${nombre} (${expresion})`,
          operationClass: 'additive',
          target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: tabla } },
          precheck: [],
          execute: [
            {
              description: `add ${nombre}`,
              sql: `ALTER TABLE "public"."${tabla}" ADD CONSTRAINT "${nombre}" CHECK (${expresion})`,
              params: [],
            },
          ],
          postcheck: [
            {
              description: `verify ${nombre}`,
              sql: `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${nombre}') AS "result"`,
              params: [],
            },
          ],
        }),
      ),
      // ---- Módulo de permisos «operaciones» (clave nueva, orden 34). Sin concesiones por defecto (D16). ----
      rawSql({
        id: 'data.modulo.operaciones',
        label: 'Semilla del módulo operaciones',
        summary: 'Inserta el módulo operaciones (Dashboard de Operaciones) si no existe; no concede permisos a ningún rol',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'seed modulo operaciones',
            sql: `INSERT INTO "public"."modulo" (clave, nombre, grupo, ruta, orden, admite_aprobar, admite_anular) VALUES ('operaciones', 'Dashboard de operaciones', 'Proyectos', '/operaciones', 34, false, false) ON CONFLICT (clave) DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify modulo operaciones',
            sql: `SELECT EXISTS (SELECT 1 FROM "public"."modulo" WHERE clave = 'operaciones') AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
