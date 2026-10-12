#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/07f14ce3cbf82e8813fa8856bb8a49ad721aa67a1cea59be5bf9bc08f3febebf/contract';
import startContract from '../../snapshots/07f14ce3cbf82e8813fa8856bb8a49ad721aa67a1cea59be5bf9bc08f3febebf/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/4094c875961b5775e82a7be4a8df6fc52e556211c0d44087739ef57ed74327d6/contract';
import endContract from '../../snapshots/4094c875961b5775e82a7be4a8df6fc52e556211c0d44087739ef57ed74327d6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'pago',
        constraint: 'pago_id_pago_programado_key',
      }),
      this.createIndex({
        schema: 'public',
        table: 'pago',
        index: 'pago_id_pago_programado_idx_f0940ecb',
        columns: ['id_pago_programado'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
