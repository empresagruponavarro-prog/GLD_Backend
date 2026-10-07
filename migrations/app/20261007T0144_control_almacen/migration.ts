#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/c4735e322dbddefb763dde8f44c473bcee4472c75c5e3f1c7dfdac941f75f58d/contract';
import startContract from '../../snapshots/c4735e322dbddefb763dde8f44c473bcee4472c75c5e3f1c7dfdac941f75f58d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f55820469a372da13106b3f628335d7097abb066e6fee335d5786f3fdfb3b90e/contract';
import endContract from '../../snapshots/f55820469a372da13106b3f628335d7097abb066e6fee335d5786f3fdfb3b90e/contract.json' with { type: 'json' };
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
      this.createTable({
        schema: 'public',
        table: 'almacen',
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
          col('id_empresa', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacen_correlativo',
        columns: [
          col('serie', 'character varying(10)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('ultimo', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['serie'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacen_documento',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('documento_referencia', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('estado', 'text', {
            notNull: true,
            default: lit('REGISTRADO'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('fecha', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_almacen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_almacen_destino', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_documento_anula', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_entregado_a', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_proveedor', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_recibido_por', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_solicitado_por', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('motivo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('motivo_trabajo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('naturaleza', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('numero', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'almacen_documento_estado_check_22231c7b',
            "\"estado\" IN ('REGISTRADO', 'ANULADO')",
          ),
          checkExpression(
            'almacen_documento_motivo_check_1ec488df',
            "\"motivo\" IN ('INVENTARIO_INICIAL', 'COMPRA', 'DEVOLUCION', 'INGRESO_CLIENTE', 'AJUSTE_POSITIVO', 'CONSUMO', 'VENTA', 'BAJA', 'AJUSTE_NEGATIVO', 'TRANSFERENCIA')",
          ),
          checkExpression(
            'almacen_documento_naturaleza_check_a33d6d12',
            "\"naturaleza\" IN ('INGRESO', 'SALIDA', 'TRANSFERENCIA')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacen_documento_detalle',
        columns: [
          col('cantidad', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('costo_unitario', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_documento', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacen_kardex',
        columns: [
          col('cantidad_entrada', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('cantidad_salida', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('costo_promedio', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('costo_total', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('costo_unitario', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fecha', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_almacen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_documento', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_documento_detalle', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('motivo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('saldo_almacen', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('saldo_total', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'almacen_kardex_motivo_check_1ec488df',
            "\"motivo\" IN ('INVENTARIO_INICIAL', 'COMPRA', 'DEVOLUCION', 'INGRESO_CLIENTE', 'AJUSTE_POSITIVO', 'CONSUMO', 'VENTA', 'BAJA', 'AJUSTE_NEGATIVO', 'TRANSFERENCIA')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacen_prestamo',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('dias_autorizados', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('documento_referencia', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('estado', 'text', {
            notNull: true,
            default: lit('ABIERTO'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('fecha_prestamo', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('fecha_prevista_retorno', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_almacen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_responsable', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('numero', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'almacen_prestamo_estado_check_b5cb890d',
            "\"estado\" IN ('ABIERTO', 'PARCIAL', 'CERRADO', 'ANULADO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacen_prestamo_detalle',
        columns: [
          col('cantidad', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('cantidad_devuelta', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_prestamo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacen_prestamo_retorno',
        columns: [
          col('cantidad', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('condicion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fecha_retorno', 'date', {
            notNull: true,
            codecRef: { codecId: 'pg/date-string@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_prestamo_detalle', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'almacen_prestamo_retorno_condicion_check_2386ef64',
            "\"condicion\" IN ('OPERATIVO', 'NO_OPERATIVO', 'CON_FALTANTES', 'DANADO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'familia_almacen',
        columns: [
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('prefijo', 'character varying(3)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 3 } },
          }),
          col('ultimo_correlativo', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'producto_alternativa',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_producto_alternativo', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('prioridad', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'stock_almacen',
        columns: [
          col('cantidad', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('cantidad_no_operativa', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('cantidad_prestada', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_almacen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('clase_inventario', 'text', {
          notNull: true,
          default: lit('CONSUMIBLE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('costo_promedio', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('estado_operativo', 'text', {
          notNull: true,
          default: lit('NORMAL'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('id_almacen_default', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('id_familia', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('stock_minimo', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('stock_objetivo', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('uso_principal', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'almacen',
        constraint: 'almacen_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'almacen_documento',
        constraint: 'almacen_documento_numero_key',
        columns: ['numero'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'almacen_prestamo',
        constraint: 'almacen_prestamo_numero_key',
        columns: ['numero'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'familia_almacen',
        constraint: 'familia_almacen_prefijo_key',
        columns: ['prefijo'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'producto',
        constraint: 'producto_clase_inventario_check_77c65b6c',
        expression:
          "\"clase_inventario\" IN ('CONSUMIBLE', 'EQUIPO_RETORNABLE', 'MERCADERIA_CLIENTE')",
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'producto',
        constraint: 'producto_estado_operativo_check_60deedde',
        expression: "\"estado_operativo\" IN ('NORMAL', 'NO_OPERATIVO', 'DESCONTINUADO')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'producto_alternativa',
        constraint: 'producto_alternativa_id_producto_id_producto_alternativo_key',
        columns: ['id_producto', 'id_producto_alternativo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'producto_alternativa',
        constraint: 'producto_alternativa_id_producto_prioridad_key',
        columns: ['id_producto', 'prioridad'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'stock_almacen',
        constraint: 'stock_almacen_id_producto_id_almacen_key',
        columns: ['id_producto', 'id_almacen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen',
        index: 'almacen_id_empresa_idx_328936e2',
        columns: ['id_empresa'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_id_almacen_destino_idx_1d546f15',
        columns: ['id_almacen_destino'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_id_almacen_idx_b58d5eda',
        columns: ['id_almacen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_id_entregado_a_idx_216d3850',
        columns: ['id_entregado_a'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_id_proveedor_idx_4edef4d1',
        columns: ['id_proveedor'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_id_recibido_por_idx_d3be1fd2',
        columns: ['id_recibido_por'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_id_solicitado_por_idx_aebe6017',
        columns: ['id_solicitado_por'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_naturaleza_fecha_idx_2cf64896',
        columns: ['naturaleza', 'fecha'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento_detalle',
        index: 'almacen_documento_detalle_id_documento_idx_d2ce5840',
        columns: ['id_documento'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento_detalle',
        index: 'almacen_documento_detalle_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_kardex',
        index: 'almacen_kardex_id_almacen_idx_b58d5eda',
        columns: ['id_almacen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_kardex',
        index: 'almacen_kardex_id_documento_detalle_idx_85ded109',
        columns: ['id_documento_detalle'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_kardex',
        index: 'almacen_kardex_id_documento_idx_d2ce5840',
        columns: ['id_documento'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_kardex',
        index: 'almacen_kardex_id_producto_id_almacen_fecha_idx_052d09cb',
        columns: ['id_producto', 'id_almacen', 'fecha'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_kardex',
        index: 'almacen_kardex_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_prestamo',
        index: 'almacen_prestamo_id_almacen_idx_b58d5eda',
        columns: ['id_almacen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_prestamo',
        index: 'almacen_prestamo_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_prestamo',
        index: 'almacen_prestamo_id_responsable_idx_f28b2d33',
        columns: ['id_responsable'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_prestamo_detalle',
        index: 'almacen_prestamo_detalle_id_prestamo_idx_25add7ba',
        columns: ['id_prestamo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_prestamo_detalle',
        index: 'almacen_prestamo_detalle_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_prestamo_retorno',
        index: 'almacen_prestamo_retorno_id_prestamo_detalle_idx_8b2365de',
        columns: ['id_prestamo_detalle'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto',
        index: 'producto_id_almacen_default_idx_b2725ca4',
        columns: ['id_almacen_default'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto',
        index: 'producto_id_familia_idx_3112e49e',
        columns: ['id_familia'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto_alternativa',
        index: 'producto_alternativa_id_producto_alternativo_idx_8ae3884e',
        columns: ['id_producto_alternativo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto_alternativa',
        index: 'producto_alternativa_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stock_almacen',
        index: 'stock_almacen_id_almacen_idx_b58d5eda',
        columns: ['id_almacen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stock_almacen',
        index: 'stock_almacen_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen',
        foreignKey: {
          name: 'almacen_id_empresa_fkey',
          columns: ['id_empresa'],
          references: { schema: 'public', table: 'empresas', columns: ['id_empresa'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento',
        foreignKey: {
          name: 'almacen_documento_id_almacen_fkey',
          columns: ['id_almacen'],
          references: { schema: 'public', table: 'almacen', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento',
        foreignKey: {
          name: 'almacen_documento_id_almacen_destino_fkey',
          columns: ['id_almacen_destino'],
          references: { schema: 'public', table: 'almacen', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento',
        foreignKey: {
          name: 'almacen_documento_id_proveedor_fkey',
          columns: ['id_proveedor'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento',
        foreignKey: {
          name: 'almacen_documento_id_recibido_por_fkey',
          columns: ['id_recibido_por'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento',
        foreignKey: {
          name: 'almacen_documento_id_solicitado_por_fkey',
          columns: ['id_solicitado_por'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento',
        foreignKey: {
          name: 'almacen_documento_id_entregado_a_fkey',
          columns: ['id_entregado_a'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento',
        foreignKey: {
          name: 'almacen_documento_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento_detalle',
        foreignKey: {
          name: 'almacen_documento_detalle_id_documento_fkey',
          columns: ['id_documento'],
          references: { schema: 'public', table: 'almacen_documento', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento_detalle',
        foreignKey: {
          name: 'almacen_documento_detalle_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_kardex',
        foreignKey: {
          name: 'almacen_kardex_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_kardex',
        foreignKey: {
          name: 'almacen_kardex_id_almacen_fkey',
          columns: ['id_almacen'],
          references: { schema: 'public', table: 'almacen', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_kardex',
        foreignKey: {
          name: 'almacen_kardex_id_documento_fkey',
          columns: ['id_documento'],
          references: { schema: 'public', table: 'almacen_documento', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_kardex',
        foreignKey: {
          name: 'almacen_kardex_id_documento_detalle_fkey',
          columns: ['id_documento_detalle'],
          references: { schema: 'public', table: 'almacen_documento_detalle', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_prestamo',
        foreignKey: {
          name: 'almacen_prestamo_id_almacen_fkey',
          columns: ['id_almacen'],
          references: { schema: 'public', table: 'almacen', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_prestamo',
        foreignKey: {
          name: 'almacen_prestamo_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_prestamo',
        foreignKey: {
          name: 'almacen_prestamo_id_responsable_fkey',
          columns: ['id_responsable'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_prestamo_detalle',
        foreignKey: {
          name: 'almacen_prestamo_detalle_id_prestamo_fkey',
          columns: ['id_prestamo'],
          references: { schema: 'public', table: 'almacen_prestamo', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_prestamo_detalle',
        foreignKey: {
          name: 'almacen_prestamo_detalle_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_prestamo_retorno',
        foreignKey: {
          name: 'almacen_prestamo_retorno_id_prestamo_detalle_fkey',
          columns: ['id_prestamo_detalle'],
          references: { schema: 'public', table: 'almacen_prestamo_detalle', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto',
        foreignKey: {
          name: 'producto_id_almacen_default_fkey',
          columns: ['id_almacen_default'],
          references: { schema: 'public', table: 'almacen', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto',
        foreignKey: {
          name: 'producto_id_familia_fkey',
          columns: ['id_familia'],
          references: { schema: 'public', table: 'familia_almacen', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto_alternativa',
        foreignKey: {
          name: 'producto_alternativa_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto_alternativa',
        foreignKey: {
          name: 'producto_alternativa_id_producto_alternativo_fkey',
          columns: ['id_producto_alternativo'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'stock_almacen',
        foreignKey: {
          name: 'stock_almacen_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'stock_almacen',
        foreignKey: {
          name: 'stock_almacen_id_almacen_fkey',
          columns: ['id_almacen'],
          references: { schema: 'public', table: 'almacen', columns: ['id'] },
        },
      }),

      rawSql({
        id: 'data.control_almacen.semillas',
        label: 'Seed almacenes, correlativos y familias',
        summary: 'Inserta almacenes iniciales, series de correlativos y familias (prefijos CON, HER, ...)',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'almacen' } },
        precheck: [],
        execute: [
          {
            description: 'seed almacenes',
            sql: "INSERT INTO \"public\".\"almacen\" (codigo, nombre) VALUES ('ALM-GENERAL','Almacén General'),('ALM-GEN1','General 1'),('ALM-GEN2','General 2'),('ALM-TAMBO','Tambo'),('ALM-ARUMA','Aruma'),('ALM-MASS','Mass'),('ALM-VALIDAR','Por validar') ON CONFLICT (codigo) DO NOTHING",
            params: [],
          },
          {
            description: 'seed correlativos',
            sql: "INSERT INTO \"public\".\"almacen_correlativo\" (serie, ultimo) VALUES ('ING',0),('SAL',0),('TRF',0),('PRE',0) ON CONFLICT (serie) DO NOTHING",
            params: [],
          },
          {
            description: 'seed familias',
            sql: "INSERT INTO \"public\".\"familia_almacen\" (prefijo, nombre) VALUES ('CON','CONSUMIBLES'),('HER','HERRAMIENTAS'),('EPP','EPPS'),('TAM','TAMBO'),('ARU','ARUMA'),('MAS','MASS'),('FER','FERRETERIA'),('ELE','HERRAMIENTAS ELECTRICAS'),('EQU','EQUIPOS VARIOS') ON CONFLICT (prefijo) DO NOTHING",
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify seeds exist',
            sql: 'SELECT (SELECT count(*) FROM "public"."almacen") >= 7 AND (SELECT count(*) FROM "public"."familia_almacen") >= 9 AS "result"',
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
