#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/07f14ce3cbf82e8813fa8856bb8a49ad721aa67a1cea59be5bf9bc08f3febebf/contract';
import endContract from '../../snapshots/07f14ce3cbf82e8813fa8856bb8a49ad721aa67a1cea59be5bf9bc08f3febebf/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9d3c3c371ab285efc968c4f0a42750ff8f510b8c806abae85dc38b135b805092/contract';
import startContract from '../../snapshots/9d3c3c371ab285efc968c4f0a42750ff8f510b8c806abae85dc38b135b805092/contract.json' with { type: 'json' };
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

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'requerimiento',
        constraint: 'requerimiento_estado_check_f79d8afa',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'requerimiento_detalle',
        constraint: 'requerimiento_detalle_id_requerimiento_id_producto_key',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'requerimiento_evento',
        constraint: 'requerimiento_evento_accion_check_5c740340',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'requerimiento_evento',
        constraint: 'requerimiento_evento_estado_anterior_check_c285bf74',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'requerimiento_evento',
        constraint: 'requerimiento_evento_estado_nuevo_check_8e282947',
      }),
      this.createTable({
        schema: 'public',
        table: 'area',
        columns: [
          col('codigo', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'cotizacion',
        columns: [
          col('adelanto_porcentaje', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('afecto_igv', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('archivo_url', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('condiciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('dias_credito', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('fecha', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('forma_pago', 'character varying(50)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('garantia', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_proveedor', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_requerimiento', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('incluye_igv', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('medio_pago', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('moneda_id', 'character varying(10)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('moneda_simbolo', 'character varying(10)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('numero', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('plazo_entrega_dias', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('referencia', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('validez_dias', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'cotizacion_medio_pago_check_e0a6d2bb',
            "\"medio_pago\" IN ('EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE', 'PLIN', 'OTRO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'cotizacion_detalle',
        columns: [
          col('cantidad', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('cotiza', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_cotizacion', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_requerimiento_detalle', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('marca_modelo', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('plazo_entrega_dias', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('precio_unitario', 'numeric', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'cuenta_tesoreria',
        columns: [
          col('banco', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('cci', 'character varying(30)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('codigo', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_empresa', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('moneda_id', 'character varying(10)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('nombre', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('numero_cuenta', 'character varying(30)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('tipo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'cuenta_tesoreria_tipo_check_87119110',
            "\"tipo\" IN ('CAJA', 'BANCO', 'BILLETERA')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'pago',
        columns: [
          col('concepto', 'text', {
            notNull: true,
            default: lit('PROVEEDOR'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('estado', 'text', {
            notNull: true,
            default: lit('REGISTRADO'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('fecha_pago', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_cuenta', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_documento_origen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_ejecutado_por', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_pago_programado', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('medio_pago', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('moneda_cuenta', 'character varying(10)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('monto', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('monto_cuenta', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('numero', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('numero_operacion', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tipo_cambio', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'pago_concepto_check_61e9b31d',
            "\"concepto\" IN ('PROVEEDOR', 'DETRACCION')",
          ),
          checkExpression('pago_estado_check_22231c7b', "\"estado\" IN ('REGISTRADO', 'ANULADO')"),
          checkExpression(
            'pago_medio_pago_check_e0a6d2bb',
            "\"medio_pago\" IN ('EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE', 'PLIN', 'OTRO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'pago_programado',
        columns: [
          col('concepto', 'text', {
            notNull: true,
            default: lit('PROVEEDOR'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('cuenta_destino', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('estado', 'text', {
            notNull: true,
            default: lit('PROGRAMADO'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('fecha_programada', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_cuenta', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_documento_origen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_programado_por', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('medio_pago', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('monto', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('urgente', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'pago_programado_concepto_check_61e9b31d',
            "\"concepto\" IN ('PROVEEDOR', 'DETRACCION')",
          ),
          checkExpression(
            'pago_programado_estado_check_e760a11a',
            "\"estado\" IN ('PROGRAMADO', 'EJECUTADO', 'CANCELADO')",
          ),
          checkExpression(
            'pago_programado_medio_pago_check_e0a6d2bb',
            "\"medio_pago\" IN ('EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE', 'PLIN', 'OTRO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'tipo_cambio_diario',
        columns: [
          col('compra', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('fecha', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('moneda_id', 'character varying(10)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('venta', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'anexos',
        column: col('cuenta_detraccion', 'character varying(30)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'anexos',
        column: col('exceptuado_retencion', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('afecto_igv', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('clase_documento', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('detraccion_monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('detraccion_porcentaje', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('dias_credito', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('estado', 'text', {
          notNull: true,
          default: lit('REGISTRADO'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('fecha_vencimiento', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('id_area', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('id_cotizacion', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('numero_documento', 'character varying(20)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('retencion_manual', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('retencion_monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('retencion_porcentaje', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento',
        column: col('comentario_adjudicacion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento',
        column: col('id_area', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento',
        column: col('id_beneficiario', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento',
        column: col('id_cotizacion_ganadora', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento',
        column: col('tipo', 'text', {
          notNull: true,
          default: lit('COMPRA'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento_detalle',
        column: col('id_beneficiario', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'area',
        constraint: 'area_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'cotizacion',
        constraint: 'cotizacion_numero_key',
        columns: ['numero'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'cotizacion',
        constraint: 'cotizacion_id_requerimiento_id_proveedor_key',
        columns: ['id_requerimiento', 'id_proveedor'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'cotizacion_detalle',
        constraint: 'cotizacion_detalle_id_cotizacion_id_requerimiento_detalle_key',
        columns: ['id_cotizacion', 'id_requerimiento_detalle'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'cuenta_tesoreria',
        constraint: 'cuenta_tesoreria_codigo_key',
        columns: ['codigo'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'documentosOrigen',
        constraint: 'documentosOrigen_clase_documento_check_078e3f9b',
        expression:
          "\"clase_documento\" IN ('ORDEN_COMPRA', 'ORDEN_SERVICIO', 'PLANILLA_PERSONAL', 'PLANILLA_OBRA', 'CAJA_CHICA', 'GASTO_FINANCIERO', 'PAGO_SERVICIO', 'OTRO')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'documentosOrigen',
        constraint: 'documentosOrigen_estado_check_22231c7b',
        expression: "\"estado\" IN ('REGISTRADO', 'ANULADO')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'documentosOrigen',
        constraint: 'documentosOrigen_numero_documento_key',
        columns: ['numero_documento'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'pago',
        constraint: 'pago_numero_key',
        columns: ['numero'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'pago',
        constraint: 'pago_id_pago_programado_key',
        columns: ['id_pago_programado'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'requerimiento',
        constraint: 'requerimiento_estado_check_1d164afe',
        expression:
          "\"estado\" IN ('BORRADOR', 'ENVIADO', 'COTIZADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'requerimiento',
        constraint: 'requerimiento_tipo_check_e0ca4d80',
        expression:
          "\"tipo\" IN ('COMPRA', 'PLANILLA_PERSONAL', 'PLANILLA_OBRA', 'CAJA_CHICA', 'GASTO_FINANCIERO', 'PAGO_SERVICIO', 'OTRO')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'requerimiento_evento',
        constraint: 'requerimiento_evento_accion_check_27cceb6a',
        expression:
          "\"accion\" IN ('CREAR', 'ENVIAR', 'CERRAR_COTIZACION', 'REABRIR_COTIZACION', 'OBSERVAR', 'APROBAR', 'RECHAZAR', 'ANULAR')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'requerimiento_evento',
        constraint: 'requerimiento_evento_estado_anterior_check_fcf761d8',
        expression:
          "\"estado_anterior\" IN ('BORRADOR', 'ENVIADO', 'COTIZADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'requerimiento_evento',
        constraint: 'requerimiento_evento_estado_nuevo_check_d4a94e8c',
        expression:
          "\"estado_nuevo\" IN ('BORRADOR', 'ENVIADO', 'COTIZADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'tipo_cambio_diario',
        constraint: 'tipo_cambio_diario_fecha_moneda_id_key',
        columns: ['fecha', 'moneda_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cotizacion',
        index: 'cotizacion_id_proveedor_idx_4edef4d1',
        columns: ['id_proveedor'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cotizacion',
        index: 'cotizacion_id_requerimiento_idx_a213c508',
        columns: ['id_requerimiento'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cotizacion_detalle',
        index: 'cotizacion_detalle_id_cotizacion_idx_49595cf0',
        columns: ['id_cotizacion'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cotizacion_detalle',
        index: 'cotizacion_detalle_id_requerimiento_detalle_idx_59ff1251',
        columns: ['id_requerimiento_detalle'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documentosOrigen',
        index: 'documentosOrigen_id_area_idx_2da0f6a6',
        columns: ['id_area'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documentosOrigen',
        index: 'documentosOrigen_id_cotizacion_idx_49595cf0',
        columns: ['id_cotizacion'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pago',
        index: 'pago_id_cuenta_idx_48ca1c78',
        columns: ['id_cuenta'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pago',
        index: 'pago_id_documento_origen_idx_90e8b67c',
        columns: ['id_documento_origen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pago_programado',
        index: 'pago_programado_fecha_programada_estado_idx_0d8b5cf9',
        columns: ['fecha_programada', 'estado'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pago_programado',
        index: 'pago_programado_id_cuenta_idx_48ca1c78',
        columns: ['id_cuenta'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'pago_programado',
        index: 'pago_programado_id_documento_origen_idx_90e8b67c',
        columns: ['id_documento_origen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_id_area_idx_2da0f6a6',
        columns: ['id_area'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_id_beneficiario_idx_9721cabf',
        columns: ['id_beneficiario'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_id_cotizacion_ganadora_idx_912cf2a3',
        columns: ['id_cotizacion_ganadora'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento_detalle',
        index: 'requerimiento_detalle_id_beneficiario_idx_9721cabf',
        columns: ['id_beneficiario'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cotizacion',
        foreignKey: {
          name: 'cotizacion_id_requerimiento_fkey',
          columns: ['id_requerimiento'],
          references: { schema: 'public', table: 'requerimiento', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cotizacion',
        foreignKey: {
          name: 'cotizacion_id_proveedor_fkey',
          columns: ['id_proveedor'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cotizacion_detalle',
        foreignKey: {
          name: 'cotizacion_detalle_id_cotizacion_fkey',
          columns: ['id_cotizacion'],
          references: { schema: 'public', table: 'cotizacion', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cotizacion_detalle',
        foreignKey: {
          name: 'cotizacion_detalle_id_requerimiento_detalle_fkey',
          columns: ['id_requerimiento_detalle'],
          references: { schema: 'public', table: 'requerimiento_detalle', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documentosOrigen',
        foreignKey: {
          name: 'documentosOrigen_id_area_fkey',
          columns: ['id_area'],
          references: { schema: 'public', table: 'area', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documentosOrigen',
        foreignKey: {
          name: 'documentosOrigen_id_cotizacion_fkey',
          columns: ['id_cotizacion'],
          references: { schema: 'public', table: 'cotizacion', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pago',
        foreignKey: {
          name: 'pago_id_documento_origen_fkey',
          columns: ['id_documento_origen'],
          references: { schema: 'public', table: 'documentosOrigen', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pago',
        foreignKey: {
          name: 'pago_id_cuenta_fkey',
          columns: ['id_cuenta'],
          references: { schema: 'public', table: 'cuenta_tesoreria', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pago',
        foreignKey: {
          name: 'pago_id_pago_programado_fkey',
          columns: ['id_pago_programado'],
          references: { schema: 'public', table: 'pago_programado', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pago_programado',
        foreignKey: {
          name: 'pago_programado_id_documento_origen_fkey',
          columns: ['id_documento_origen'],
          references: { schema: 'public', table: 'documentosOrigen', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'pago_programado',
        foreignKey: {
          name: 'pago_programado_id_cuenta_fkey',
          columns: ['id_cuenta'],
          references: { schema: 'public', table: 'cuenta_tesoreria', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento',
        foreignKey: {
          name: 'requerimiento_id_area_fkey',
          columns: ['id_area'],
          references: { schema: 'public', table: 'area', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento',
        foreignKey: {
          name: 'requerimiento_id_beneficiario_fkey',
          columns: ['id_beneficiario'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento',
        foreignKey: {
          name: 'requerimiento_id_cotizacion_ganadora_fkey',
          columns: ['id_cotizacion_ganadora'],
          references: { schema: 'public', table: 'cotizacion', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento_detalle',
        foreignKey: {
          name: 'requerimiento_detalle_id_beneficiario_fkey',
          columns: ['id_beneficiario'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      rawSql({
        id: 'data.modulo_administrativo.semillas',
        label: 'Series, areas, conceptos y backfill de clase de documento de origen',
        summary: 'Crea series de correlativo, areas iniciales, productos concepto para FUR no-compra y clasifica los documentos de origen existentes',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'almacen_correlativo' } },
        precheck: [],
        execute: [
          {
            description: 'seed series',
            sql: "INSERT INTO \"public\".\"almacen_correlativo\" (serie, ultimo) VALUES ('COT',0),('CP',0),('OC',0),('OS',0),('PP',0),('PO',0),('CCH',0),('GF',0),('PS',0),('DO',0) ON CONFLICT (serie) DO NOTHING",
            params: [],
          },
          {
            description: 'seed areas',
            sql: "INSERT INTO \"public\".\"area\" (codigo, nombre) VALUES ('COSTOS','Costos y Presupuesto'),('OFTEC','Oficina Tecnica'),('PROCURA','Procura'),('COMERCIAL','Comercializacion'),('POSVENTA','Posventa'),('ALMACEN','Almacen'),('SISTEMAS','Sistemas') ON CONFLICT (codigo) DO NOTHING",
            params: [],
          },
          {
            description: 'seed productos concepto',
            sql: "INSERT INTO \"public\".\"producto\" (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) SELECT v.codigo, v.descripcion, (SELECT id FROM \"public\".\"categoria\" WHERE codigo = 'GSGRAL' LIMIT 1), (SELECT id FROM \"public\".\"unidad_medida\" ORDER BY (codigo ILIKE 'UND%') DESC, id LIMIT 1), 'SERVICIO' FROM (VALUES ('CONC-PLANILLA-PERSONAL','PLANILLA DE PERSONAL'),('CONC-PLANILLA-OBRA','PLANILLA DE OBRA'),('CONC-CAJA-CHICA','REEMBOLSO DE CAJA CHICA'),('CONC-GASTO-FINANCIERO','GASTO FINANCIERO'),('CONC-PAGO-SERVICIO','PAGO DE SERVICIO'),('CONC-OTRO','OTRO CONCEPTO')) AS v(codigo, descripcion) WHERE EXISTS (SELECT 1 FROM \"public\".\"categoria\" WHERE codigo = 'GSGRAL') AND EXISTS (SELECT 1 FROM \"public\".\"unidad_medida\") ON CONFLICT (codigo) DO NOTHING",
            params: [],
          },
          {
            description: 'backfill clase_documento',
            sql: "UPDATE \"public\".\"documentosOrigen\" SET clase_documento = CASE WHEN tipo_oc = 'SERVICIO' THEN 'ORDEN_SERVICIO' ELSE 'ORDEN_COMPRA' END WHERE clase_documento IS NULL",
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
