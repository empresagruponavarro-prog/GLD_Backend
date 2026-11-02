#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/111a0dfc38cf8cff922886de204290be58a8372f9c81cd5b6a001ecbf7cd132b/contract';
import endContract from '../../snapshots/111a0dfc38cf8cff922886de204290be58a8372f9c81cd5b6a001ecbf7cd132b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract';
import startContract from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'area',
        column: col('descripcion', 'character varying(255)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'area',
        column: col('id_jefe', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'area',
        index: 'area_id_jefe_idx_8c5b92e7',
        columns: ['id_jefe'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'area',
        foreignKey: {
          name: 'area_id_jefe_fkey',
          columns: ['id_jefe'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
