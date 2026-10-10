#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/58a53db16b943e22fc39d93c3ea0b2939491b3493ef95c3be42ab7d85f3400a7/contract';
import startContract from '../../snapshots/58a53db16b943e22fc39d93c3ea0b2939491b3493ef95c3be42ab7d85f3400a7/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9d3c3c371ab285efc968c4f0a42750ff8f510b8c806abae85dc38b135b805092/contract';
import endContract from '../../snapshots/9d3c3c371ab285efc968c4f0a42750ff8f510b8c806abae85dc38b135b805092/contract.json' with { type: 'json' };
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
        table: 'requerimiento',
        columns: [
          col('area', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('comentario_aprobacion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
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
          col('fecha', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('fecha_aprobacion', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fecha_requerida', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_aprobador', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_fase', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_solicitante', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('justificacion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('numero', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'requerimiento_estado_check_f79d8afa',
            "\"estado\" IN ('BORRADOR', 'ENVIADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'requerimiento_detalle',
        columns: [
          col('cantidad', 'numeric', { notNull: true, codecRef: { codecId: 'pg/numeric@1' } }),
          col('cantidad_aprobada', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_requerimiento', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('observaciones', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('precio_referencial', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'requerimiento_evento',
        columns: [
          col('accion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('comentario', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('estado_anterior', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('estado_nuevo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_anexo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_requerimiento', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'requerimiento_evento_accion_check_5c740340',
            "\"accion\" IN ('CREAR', 'ENVIAR', 'OBSERVAR', 'APROBAR', 'RECHAZAR', 'ANULAR')",
          ),
          checkExpression(
            'requerimiento_evento_estado_anterior_check_c285bf74',
            "\"estado_anterior\" IN ('BORRADOR', 'ENVIADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO')",
          ),
          checkExpression(
            'requerimiento_evento_estado_nuevo_check_8e282947',
            "\"estado_nuevo\" IN ('BORRADOR', 'ENVIADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO')",
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'almacen_documento',
        column: col('id_orden_compra', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'almacen_documento_detalle',
        column: col('id_orden_compra_detalle', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('id_requerimiento', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ordenCompraDetalle',
        column: col('id_producto', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ordenCompraDetalle',
        column: col('id_requerimiento_detalle', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'requerimiento',
        constraint: 'requerimiento_numero_key',
        columns: ['numero'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'requerimiento_detalle',
        constraint: 'requerimiento_detalle_id_requerimiento_id_producto_key',
        columns: ['id_requerimiento', 'id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento',
        index: 'almacen_documento_id_orden_compra_idx_ceb1e2df',
        columns: ['id_orden_compra'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento_detalle',
        index: 'almacen_documento_detalle_id_orden_compra_detalle_idx_fd456bbf',
        columns: ['id_orden_compra_detalle'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'documentosOrigen',
        index: 'documentosOrigen_id_requerimiento_idx_a213c508',
        columns: ['id_requerimiento'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompraDetalle',
        index: 'ordenCompraDetalle_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompraDetalle',
        index: 'ordenCompraDetalle_id_requerimiento_detalle_idx_59ff1251',
        columns: ['id_requerimiento_detalle'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_estado_fecha_idx_14aede9c',
        columns: ['estado', 'fecha'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_id_aprobador_idx_450234e5',
        columns: ['id_aprobador'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_id_fase_idx_f598027b',
        columns: ['id_fase'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento',
        index: 'requerimiento_id_solicitante_idx_e2e93885',
        columns: ['id_solicitante'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento_detalle',
        index: 'requerimiento_detalle_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento_detalle',
        index: 'requerimiento_detalle_id_requerimiento_idx_a213c508',
        columns: ['id_requerimiento'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento_evento',
        index: 'requerimiento_evento_id_anexo_idx_726d2e48',
        columns: ['id_anexo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento_evento',
        index: 'requerimiento_evento_id_requerimiento_idx_a213c508',
        columns: ['id_requerimiento'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento',
        foreignKey: {
          name: 'almacen_documento_id_orden_compra_fkey',
          columns: ['id_orden_compra'],
          references: { schema: 'public', table: 'documentosOrigen', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento_detalle',
        foreignKey: {
          name: 'almacen_documento_detalle_id_orden_compra_detalle_fkey',
          columns: ['id_orden_compra_detalle'],
          references: { schema: 'public', table: 'ordenCompraDetalle', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompraDetalle',
        foreignKey: {
          name: 'ordenCompraDetalle_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento',
        foreignKey: {
          name: 'requerimiento_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento',
        foreignKey: {
          name: 'requerimiento_id_fase_fkey',
          columns: ['id_fase'],
          references: { schema: 'public', table: 'ppto_Fases', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento',
        foreignKey: {
          name: 'requerimiento_id_solicitante_fkey',
          columns: ['id_solicitante'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento',
        foreignKey: {
          name: 'requerimiento_id_aprobador_fkey',
          columns: ['id_aprobador'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documentosOrigen',
        foreignKey: {
          name: 'documentosOrigen_id_requerimiento_fkey',
          columns: ['id_requerimiento'],
          references: { schema: 'public', table: 'requerimiento', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento_detalle',
        foreignKey: {
          name: 'requerimiento_detalle_id_requerimiento_fkey',
          columns: ['id_requerimiento'],
          references: { schema: 'public', table: 'requerimiento', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento_detalle',
        foreignKey: {
          name: 'requerimiento_detalle_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompraDetalle',
        foreignKey: {
          name: 'ordenCompraDetalle_id_requerimiento_detalle_fkey',
          columns: ['id_requerimiento_detalle'],
          references: { schema: 'public', table: 'requerimiento_detalle', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento_evento',
        foreignKey: {
          name: 'requerimiento_evento_id_requerimiento_fkey',
          columns: ['id_requerimiento'],
          references: { schema: 'public', table: 'requerimiento', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento_evento',
        foreignKey: {
          name: 'requerimiento_evento_id_anexo_fkey',
          columns: ['id_anexo'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
        },
      }),
      rawSql({
        id: 'data.requerimientos_fur.semillas',
        label: 'Serie FUR y backfill de id_producto en lineas de OC',
        summary: 'Crea la serie de correlativo FUR y enlaza las lineas de OC existentes con producto por ProductoCodigo',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'almacen_correlativo' } },
        precheck: [],
        execute: [
          {
            description: 'seed correlativo FUR',
            sql: "INSERT INTO \"public\".\"almacen_correlativo\" (serie, ultimo) VALUES ('FUR',0) ON CONFLICT (serie) DO NOTHING",
            params: [],
          },
          {
            description: 'backfill id_producto en ordenCompraDetalle',
            sql: "UPDATE \"public\".\"ordenCompraDetalle\" d SET id_producto = p.id FROM \"public\".producto p WHERE p.codigo = d.\"ProductoCodigo\" AND d.id_producto IS NULL",
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify FUR series exists',
            sql: "SELECT EXISTS (SELECT 1 FROM \"public\".\"almacen_correlativo\" WHERE serie = 'FUR') AS \"result\"",
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
