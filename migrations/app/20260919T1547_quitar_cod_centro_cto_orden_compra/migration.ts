#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/a78ea23630418d85939d084a489926b330cdff3a08edc880062d80ba91c6a6c2/contract';
import startContract from '../../snapshots/a78ea23630418d85939d084a489926b330cdff3a08edc880062d80ba91c6a6c2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/fecd990094024bcfd5fc94cc80ea5d1c4b42a33b650a3b3588ed6694bd2f1b12/contract';
import endContract from '../../snapshots/fecd990094024bcfd5fc94cc80ea5d1c4b42a33b650a3b3588ed6694bd2f1b12/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: 'public', table: 'ordenCompra', column: 'CodCentroCto' }),
      this.dropColumn({ schema: 'public', table: 'ordenCompra', column: 'CodCentroCtoPrincipal' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
