#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/aa973976ede0ef13a1ed08e4c609b2465f74fd79a64f83a5f287b262e8434a76/contract';
import startContract from '../../snapshots/aa973976ede0ef13a1ed08e4c609b2465f74fd79a64f83a5f287b262e8434a76/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e59a77677da880c415725e6ff4129ab549911585f314f497031035b074726084/contract';
import endContract from '../../snapshots/e59a77677da880c415725e6ff4129ab549911585f314f497031035b074726084/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'area_modulo',
        columns: [
          col('area_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('modulo_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('solo_lectura', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'area_modulo',
        constraint: 'area_modulo_area_id_modulo_id_key',
        columns: ['area_id', 'modulo_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'area_modulo',
        index: 'area_modulo_area_id_idx_106c7330',
        columns: ['area_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'area_modulo',
        index: 'area_modulo_modulo_id_idx_610f44c7',
        columns: ['modulo_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'area_modulo',
        foreignKey: {
          name: 'area_modulo_area_id_fkey',
          columns: ['area_id'],
          references: { schema: 'public', table: 'area', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'area_modulo',
        foreignKey: {
          name: 'area_modulo_modulo_id_fkey',
          columns: ['modulo_id'],
          references: { schema: 'public', table: 'modulo', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
