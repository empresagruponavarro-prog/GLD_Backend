#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/e079c776e75cad27cba358a452d5cedb8948f06a894ebb7061c8e14f3ceb99fa/contract';
import endContract from '../../snapshots/e079c776e75cad27cba358a452d5cedb8948f06a894ebb7061c8e14f3ceb99fa/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'categoria',
        columns: [
          col('codigo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('descripcion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_tipo_categoria', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'producto',
        columns: [
          col('codigo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('comentarios', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('descripcion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_categoria', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_unidad_medida', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('imagen_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('stock', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('tipo_producto', 'text', {
            notNull: true,
            default: lit('PRODUCTO'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'producto_tipo_producto_check_45026309',
            "\"tipo_producto\" IN ('PRODUCTO', 'SERVICIO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'tipo_categoria',
        columns: [
          col('codigo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'unidad_medida',
        columns: [
          col('codigo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('descripcion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('simbolo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        columns: [
          col('factor_conversion', 'numeric', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_uni_med_destino', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_uni_med_origen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'categoria',
        constraint: 'categoria_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'producto',
        constraint: 'producto_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'tipo_categoria',
        constraint: 'tipo_categoria_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'unidad_medida',
        constraint: 'unidad_medida_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        constraint: 'unidad_medida_equivalencia_id_uni_med_origen_id_uni_med_destino_key',
        columns: ['id_uni_med_origen', 'id_uni_med_destino'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'categoria',
        index: 'categoria_id_tipo_categoria_idx_ac61ceef',
        columns: ['id_tipo_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto',
        index: 'producto_id_categoria_idx_dc879264',
        columns: ['id_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto',
        index: 'producto_id_unidad_medida_idx_e475ad90',
        columns: ['id_unidad_medida'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        index: 'unidad_medida_equivalencia_id_uni_med_destino_idx_2e03e6bc',
        columns: ['id_uni_med_destino'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        index: 'unidad_medida_equivalencia_id_uni_med_origen_idx_78ff0333',
        columns: ['id_uni_med_origen'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'categoria',
        foreignKey: {
          name: 'categoria_id_tipo_categoria_fkey',
          columns: ['id_tipo_categoria'],
          references: { schema: 'public', table: 'tipo_categoria', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto',
        foreignKey: {
          name: 'producto_id_categoria_fkey',
          columns: ['id_categoria'],
          references: { schema: 'public', table: 'categoria', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto',
        foreignKey: {
          name: 'producto_id_unidad_medida_fkey',
          columns: ['id_unidad_medida'],
          references: { schema: 'public', table: 'unidad_medida', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        foreignKey: {
          name: 'unidad_medida_equivalencia_id_uni_med_origen_fkey',
          columns: ['id_uni_med_origen'],
          references: { schema: 'public', table: 'unidad_medida', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        foreignKey: {
          name: 'unidad_medida_equivalencia_id_uni_med_destino_fkey',
          columns: ['id_uni_med_destino'],
          references: { schema: 'public', table: 'unidad_medida', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
