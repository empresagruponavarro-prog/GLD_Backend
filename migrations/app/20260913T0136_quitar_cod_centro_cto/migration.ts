#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/61fb51a924e52f6ea2cddb424bb22ae2373832d5a73a086f1d0d291ab6d3940a/contract';
import endContract from '../../snapshots/61fb51a924e52f6ea2cddb424bb22ae2373832d5a73a086f1d0d291ab6d3940a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/9460e42521ba61524810495ec94b80ee40cb96d4c0c4a4a933c35ce9edfdbbc1/contract';
import startContract from '../../snapshots/9460e42521ba61524810495ec94b80ee40cb96d4c0c4a4a933c35ce9edfdbbc1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'CentroCostos',
        constraint: 'CentroCostos_cod_centro_cto_key',
      }),
      this.dropColumn({ schema: 'public', table: 'CentroCostos', column: 'cod_centro_cto' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
