#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/111a0dfc38cf8cff922886de204290be58a8372f9c81cd5b6a001ecbf7cd132b/contract';
import startContract from '../../snapshots/111a0dfc38cf8cff922886de204290be58a8372f9c81cd5b6a001ecbf7cd132b/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8f4cf05305c3d9983e6dac2ea57d01bcef1c44e028d6f87413420627874c5d29/contract';
import endContract from '../../snapshots/8f4cf05305c3d9983e6dac2ea57d01bcef1c44e028d6f87413420627874c5d29/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'area',
        column: col('id_area_padre', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'area',
        index: 'area_id_area_padre_idx_66dd6b6b',
        columns: ['id_area_padre'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'area',
        foreignKey: {
          name: 'area_id_area_padre_fkey',
          columns: ['id_area_padre'],
          references: { schema: 'public', table: 'area', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
