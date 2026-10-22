#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1a0cd5bcd09a5124f42a9d2d8c6efbb3e8d212c6cd341bee61089fe0cb513814/contract';
import startContract from '../../snapshots/1a0cd5bcd09a5124f42a9d2d8c6efbb3e8d212c6cd341bee61089fe0cb513814/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/aa973976ede0ef13a1ed08e4c609b2465f74fd79a64f83a5f287b262e8434a76/contract';
import endContract from '../../snapshots/aa973976ede0ef13a1ed08e4c609b2465f74fd79a64f83a5f287b262e8434a76/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'usuario_permiso',
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
          col('usuario_id', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
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
        column: col('id_area', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'usuario_permiso',
        constraint: 'usuario_permiso_usuario_id_modulo_id_key',
        columns: ['usuario_id', 'modulo_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'usuario_permiso',
        index: 'usuario_permiso_modulo_id_idx_610f44c7',
        columns: ['modulo_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'usuario_permiso',
        index: 'usuario_permiso_usuario_id_idx_65b6616a',
        columns: ['usuario_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'usuarios',
        index: 'usuarios_id_area_idx_2da0f6a6',
        columns: ['id_area'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'usuario_permiso',
        foreignKey: {
          name: 'usuario_permiso_usuario_id_fkey',
          columns: ['usuario_id'],
          references: { schema: 'public', table: 'usuarios', columns: ['IdUsuario'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'usuario_permiso',
        foreignKey: {
          name: 'usuario_permiso_modulo_id_fkey',
          columns: ['modulo_id'],
          references: { schema: 'public', table: 'modulo', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'usuarios',
        foreignKey: {
          name: 'usuarios_id_area_fkey',
          columns: ['id_area'],
          references: { schema: 'public', table: 'area', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
