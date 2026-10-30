#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/bf4c8d176845184481328c4d6f75af576bf144d3dc4531ca678d65b21b05a7ac/contract';
import endContract from '../../snapshots/bf4c8d176845184481328c4d6f75af576bf144d3dc4531ca678d65b21b05a7ac/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e59a77677da880c415725e6ff4129ab549911585f314f497031035b074726084/contract';
import startContract from '../../snapshots/e59a77677da880c415725e6ff4129ab549911585f314f497031035b074726084/contract.json' with { type: 'json' };
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
        table: 'producto',
        constraint: 'producto_clase_inventario_check_77c65b6c',
      }),
      this.createTable({
        schema: 'public',
        table: 'activo_fijo',
        columns: [
          col('codigo', 'character varying(30)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('estado', 'text', {
            notNull: true,
            default: lit('OPERATIVO'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('fecha_asignacion', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_area', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_empresa', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_responsable', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_ubicacion', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('serie', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'activo_fijo_estado_check_4c09dba9',
            "\"estado\" IN ('OPERATIVO', 'NO_OPERATIVO', 'EN_REPARACION', 'DE_BAJA')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'activo_fijo_caracteristica',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_activo_fijo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(60)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('valor', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'activo_fijo_historial',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('destino_anterior', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('destino_nuevo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('fecha', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_activo_fijo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_area_anterior', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_area_nueva', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_responsable_anterior', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_responsable_nuevo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_ubicacion_anterior', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_ubicacion_nueva', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('movimiento', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'activo_fijo_historial_movimiento_check_014b4982',
            "\"movimiento\" IN ('ASIGNACION', 'REASIGNACION', 'DEVOLUCION', 'TRASLADO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'ambiente',
        columns: [
          col('codigo', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('descripcion', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'local',
        columns: [
          col('codigo', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('direccion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_empresa', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'nivel',
        columns: [
          col('codigo', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('descripcion', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'producto_caracteristica',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(60)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('valor', 'character varying(150)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ubicacion',
        columns: [
          col('codigo', 'character varying(50)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_ambiente', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_area', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_local', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_nivel', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('observaciones', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'activo_fijo',
        constraint: 'activo_fijo_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'activo_fijo_caracteristica',
        constraint: 'activo_fijo_caracteristica_id_activo_fijo_nombre_key',
        columns: ['id_activo_fijo', 'nombre'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ambiente',
        constraint: 'ambiente_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'local',
        constraint: 'local_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'nivel',
        constraint: 'nivel_codigo_key',
        columns: ['codigo'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'producto',
        constraint: 'producto_clase_inventario_check_a0c70268',
        expression:
          "\"clase_inventario\" IN ('CONSUMIBLE', 'EQUIPO_RETORNABLE', 'MERCADERIA_CLIENTE', 'ACTIVO_FIJO')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'producto_caracteristica',
        constraint: 'producto_caracteristica_id_producto_nombre_key',
        columns: ['id_producto', 'nombre'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ubicacion',
        constraint: 'ubicacion_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ubicacion',
        constraint: 'ubicacion_id_local_id_nivel_id_ambiente_key',
        columns: ['id_local', 'id_nivel', 'id_ambiente'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activo_fijo',
        index: 'activo_fijo_id_area_idx_2da0f6a6',
        columns: ['id_area'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activo_fijo',
        index: 'activo_fijo_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activo_fijo',
        index: 'activo_fijo_id_empresa_idx_328936e2',
        columns: ['id_empresa'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activo_fijo',
        index: 'activo_fijo_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activo_fijo',
        index: 'activo_fijo_id_responsable_idx_f28b2d33',
        columns: ['id_responsable'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activo_fijo',
        index: 'activo_fijo_id_ubicacion_idx_cf0b54d1',
        columns: ['id_ubicacion'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activo_fijo_caracteristica',
        index: 'activo_fijo_caracteristica_id_activo_fijo_idx_e14c77d2',
        columns: ['id_activo_fijo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'activo_fijo_historial',
        index: 'activo_fijo_historial_id_activo_fijo_idx_e14c77d2',
        columns: ['id_activo_fijo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'local',
        index: 'local_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'local',
        index: 'local_id_empresa_idx_328936e2',
        columns: ['id_empresa'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto_caracteristica',
        index: 'producto_caracteristica_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ubicacion',
        index: 'ubicacion_id_ambiente_idx_27009780',
        columns: ['id_ambiente'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ubicacion',
        index: 'ubicacion_id_area_idx_2da0f6a6',
        columns: ['id_area'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ubicacion',
        index: 'ubicacion_id_local_idx_573613ca',
        columns: ['id_local'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ubicacion',
        index: 'ubicacion_id_nivel_idx_b90dc345',
        columns: ['id_nivel'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activo_fijo',
        foreignKey: {
          name: 'activo_fijo_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activo_fijo',
        foreignKey: {
          name: 'activo_fijo_id_responsable_fkey',
          columns: ['id_responsable'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activo_fijo',
        foreignKey: {
          name: 'activo_fijo_id_ubicacion_fkey',
          columns: ['id_ubicacion'],
          references: { schema: 'public', table: 'ubicacion', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activo_fijo',
        foreignKey: {
          name: 'activo_fijo_id_area_fkey',
          columns: ['id_area'],
          references: { schema: 'public', table: 'area', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activo_fijo',
        foreignKey: {
          name: 'activo_fijo_id_empresa_fkey',
          columns: ['id_empresa'],
          references: { schema: 'public', table: 'empresas', columns: ['id_empresa'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activo_fijo',
        foreignKey: {
          name: 'activo_fijo_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activo_fijo_caracteristica',
        foreignKey: {
          name: 'activo_fijo_caracteristica_id_activo_fijo_fkey',
          columns: ['id_activo_fijo'],
          references: { schema: 'public', table: 'activo_fijo', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'activo_fijo_historial',
        foreignKey: {
          name: 'activo_fijo_historial_id_activo_fijo_fkey',
          columns: ['id_activo_fijo'],
          references: { schema: 'public', table: 'activo_fijo', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'local',
        foreignKey: {
          name: 'local_id_empresa_fkey',
          columns: ['id_empresa'],
          references: { schema: 'public', table: 'empresas', columns: ['id_empresa'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'local',
        foreignKey: {
          name: 'local_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto_caracteristica',
        foreignKey: {
          name: 'producto_caracteristica_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ubicacion',
        foreignKey: {
          name: 'ubicacion_id_local_fkey',
          columns: ['id_local'],
          references: { schema: 'public', table: 'local', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ubicacion',
        foreignKey: {
          name: 'ubicacion_id_nivel_fkey',
          columns: ['id_nivel'],
          references: { schema: 'public', table: 'nivel', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ubicacion',
        foreignKey: {
          name: 'ubicacion_id_ambiente_fkey',
          columns: ['id_ambiente'],
          references: { schema: 'public', table: 'ambiente', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
