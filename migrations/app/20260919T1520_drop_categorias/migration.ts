#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a78ea23630418d85939d084a489926b330cdff3a08edc880062d80ba91c6a6c2/contract';
import endContract from '../../snapshots/a78ea23630418d85939d084a489926b330cdff3a08edc880062d80ba91c6a6c2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b8157094014a418a94b6e6e8ab9d5fae548264060fa88216978a0d875f1b462f/contract';
import startContract from '../../snapshots/b8157094014a418a94b6e6e8ab9d5fae548264060fa88216978a0d875f1b462f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [this.dropTable({ schema: 'public', table: 'categorias' })];
  }
}

MigrationCLI.run(import.meta.url, M);
