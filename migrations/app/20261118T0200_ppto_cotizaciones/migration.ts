#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3ee462c8e7bd29067f4ac4cade42f49ce1ac0a34d4bb2d23145ba9d9b70423f9/contract';
import startContract from '../../snapshots/3ee462c8e7bd29067f4ac4cade42f49ce1ac0a34d4bb2d23145ba9d9b70423f9/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f2b3f6cff647e74653da2b2af207be04dc1081128532faf01e7f553cab1a2d41/contract';
import endContract from '../../snapshots/f2b3f6cff647e74653da2b2af207be04dc1081128532faf01e7f553cab1a2d41/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'documentosOrigen',
        constraint: 'documentosOrigen_estado_check_22231c7b',
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_cotizacion',
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
          col('id_detalle_fase', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_presupuesto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_proveedor', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
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
          col('registrado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('validez_dias', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ppto_cotizacion_medio_pago_check_e0a6d2bb',
            "\"medio_pago\" IN ('EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE', 'PLIN', 'OTRO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_cotizacion_detalle',
        columns: [
          col('cantidad', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('cotiza', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_cotizacion', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_ppto_item', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
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
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleItems',
        column: col('adjudicado_por', 'character varying(255)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleItems',
        column: col('comentario_adjudicacion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleItems',
        column: col('fecha_adjudicacion', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleItems',
        column: col('id_item_origen', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleItems',
        column: col('id_ppto_cot_detalle_ganadora', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento',
        column: col('id_ppto_principal', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento',
        column: col('origen', 'text', {
          notNull: true,
          default: lit('MANUAL'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento_detalle',
        column: col('id_ppto_item', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'usuarios',
        column: col('id_trabajador', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'documentosOrigen',
        constraint: 'documentosOrigen_estado_check_decb1ff0',
        expression: "\"estado\" IN ('PROVISIONAL', 'REGISTRADO', 'ANULADO')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_cotizacion',
        constraint: 'ppto_cotizacion_numero_key',
        columns: ['numero'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_cotizacion',
        constraint: 'ppto_cotizacion_id_detalle_fase_id_proveedor_key',
        columns: ['id_detalle_fase', 'id_proveedor'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_cotizacion_detalle',
        constraint: 'ppto_cotizacion_detalle_id_cotizacion_id_ppto_item_key',
        columns: ['id_cotizacion', 'id_ppto_item'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'requerimiento',
        constraint: 'requerimiento_origen_check_6c1ac36d',
        expression: "\"origen\" IN ('MANUAL', 'PPTO_FASE', 'PPTO_ADJUDICACION')",
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleItems',
        index: 'ppto_DetalleItems_id_item_origen_idx_0ff49c6d',
        columns: ['id_item_origen'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleItems',
        index: 'ppto_DetalleItems_id_ppto_cot_detalle_ganadora_idx_b8209d48',
        columns: ['id_ppto_cot_detalle_ganadora'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_cotizacion',
        index: 'ppto_cotizacion_id_detalle_fase_idx_baca5911',
        columns: ['id_detalle_fase'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_cotizacion',
        index: 'ppto_cotizacion_id_presupuesto_idx_c44c4c50',
        columns: ['id_presupuesto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_cotizacion',
        index: 'ppto_cotizacion_id_proveedor_idx_4edef4d1',
        columns: ['id_proveedor'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_cotizacion_detalle',
        index: 'ppto_cotizacion_detalle_id_cotizacion_idx_49595cf0',
        columns: ['id_cotizacion'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_cotizacion_detalle',
        index: 'ppto_cotizacion_detalle_id_ppto_item_idx_06e4b8fe',
        columns: ['id_ppto_item'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_id_ppto_principal_idx_4f26647a',
        columns: ['id_ppto_principal'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento_detalle',
        index: 'requerimiento_detalle_id_ppto_item_idx_06e4b8fe',
        columns: ['id_ppto_item'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'usuarios',
        index: 'usuarios_id_trabajador_idx_efbff78d',
        columns: ['id_trabajador'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleItems',
        foreignKey: {
          name: 'ppto_DetalleItems_id_item_origen_fkey',
          columns: ['id_item_origen'],
          references: { schema: 'public', table: 'ppto_DetalleItems', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_cotizacion',
        foreignKey: {
          name: 'ppto_cotizacion_id_presupuesto_fkey',
          columns: ['id_presupuesto'],
          references: { schema: 'public', table: 'ppto_Principal', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_cotizacion',
        foreignKey: {
          name: 'ppto_cotizacion_id_detalle_fase_fkey',
          columns: ['id_detalle_fase'],
          references: { schema: 'public', table: 'ppto_DetalleFases', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_cotizacion',
        foreignKey: {
          name: 'ppto_cotizacion_id_proveedor_fkey',
          columns: ['id_proveedor'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_cotizacion_detalle',
        foreignKey: {
          name: 'ppto_cotizacion_detalle_id_cotizacion_fkey',
          columns: ['id_cotizacion'],
          references: { schema: 'public', table: 'ppto_cotizacion', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_cotizacion_detalle',
        foreignKey: {
          name: 'ppto_cotizacion_detalle_id_ppto_item_fkey',
          columns: ['id_ppto_item'],
          references: { schema: 'public', table: 'ppto_DetalleItems', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleItems',
        foreignKey: {
          name: 'ppto_DetalleItems_id_ppto_cot_detalle_ganadora_fkey',
          columns: ['id_ppto_cot_detalle_ganadora'],
          references: { schema: 'public', table: 'ppto_cotizacion_detalle', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento',
        foreignKey: {
          name: 'requerimiento_id_ppto_principal_fkey',
          columns: ['id_ppto_principal'],
          references: { schema: 'public', table: 'ppto_Principal', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento_detalle',
        foreignKey: {
          name: 'requerimiento_detalle_id_ppto_item_fkey',
          columns: ['id_ppto_item'],
          references: { schema: 'public', table: 'ppto_DetalleItems', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'usuarios',
        foreignKey: {
          name: 'usuarios_id_trabajador_fkey',
          columns: ['id_trabajador'],
          references: { schema: 'public', table: 'trabajador', columns: ['id_anexo'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
