#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/365321126bdf35e1149a365738100ec05c0259baae20d5d67d3e404289a6f95e/contract';
import endContract from '../../snapshots/365321126bdf35e1149a365738100ec05c0259baae20d5d67d3e404289a6f95e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a98b82d439259f84647bc4f70f2e14252855249ffcd29c33984af569a20b416f/contract';
import startContract from '../../snapshots/a98b82d439259f84647bc4f70f2e14252855249ffcd29c33984af569a20b416f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: col('id_fase', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'documentosOrigen',
        index: 'documentosOrigen_id_fase_idx_f598027b',
        columns: ['id_fase'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'documentosOrigen',
        foreignKey: {
          name: 'documentosOrigen_id_fase_fkey',
          columns: ['id_fase'],
          references: { schema: 'public', table: 'ppto_Fases', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
