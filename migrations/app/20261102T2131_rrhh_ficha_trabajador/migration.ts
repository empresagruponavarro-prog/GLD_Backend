#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/73e6fa47ad298b32c5cd5acc8de25f67f1ab9b97adb0541d5958b3e1fbd2ba29/contract';
import startContract from '../../snapshots/73e6fa47ad298b32c5cd5acc8de25f67f1ab9b97adb0541d5958b3e1fbd2ba29/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract';
import endContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'rrhh_modalidad_contrato',
        columns: [
          col('activo', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'rrhh_tipo_trabajador',
        columns: [
          col('activo', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'trabajador',
        columns: [
          col('correo_institucional', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('direccion_institucional', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id_anexo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_area', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_modalidad_contrato', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_tipo_trabajador', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('telefono_institucional', 'character varying(60)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 60 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id_anexo'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'rrhh_modalidad_contrato',
        constraint: 'rrhh_modalidad_contrato_nombre_key',
        columns: ['nombre'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'rrhh_tipo_trabajador',
        constraint: 'rrhh_tipo_trabajador_nombre_key',
        columns: ['nombre'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'trabajador',
        index: 'trabajador_id_area_idx_2da0f6a6',
        columns: ['id_area'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'trabajador',
        index: 'trabajador_id_modalidad_contrato_idx_ecd05a98',
        columns: ['id_modalidad_contrato'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'trabajador',
        index: 'trabajador_id_tipo_trabajador_idx_ff5bb98d',
        columns: ['id_tipo_trabajador'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'trabajador',
        foreignKey: {
          name: 'trabajador_id_anexo_fkey',
          columns: ['id_anexo'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'trabajador',
        foreignKey: {
          name: 'trabajador_id_tipo_trabajador_fkey',
          columns: ['id_tipo_trabajador'],
          references: { schema: 'public', table: 'rrhh_tipo_trabajador', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'trabajador',
        foreignKey: {
          name: 'trabajador_id_modalidad_contrato_fkey',
          columns: ['id_modalidad_contrato'],
          references: { schema: 'public', table: 'rrhh_modalidad_contrato', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'trabajador',
        foreignKey: {
          name: 'trabajador_id_area_fkey',
          columns: ['id_area'],
          references: { schema: 'public', table: 'area', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
