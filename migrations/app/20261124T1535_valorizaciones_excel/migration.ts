#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/19e91f26d3957aa82fbdb26ed53e1a5016fffce35dd25673ee5407384fce52ca/contract';
import startContract from '../../snapshots/19e91f26d3957aa82fbdb26ed53e1a5016fffce35dd25673ee5407384fce52ca/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/789ecbd62c75f699a93a55e4cfb406987728e84a2e8ac80cc82477398a1b9371/contract';
import endContract from '../../snapshots/789ecbd62c75f699a93a55e4cfb406987728e84a2e8ac80cc82477398a1b9371/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'condicion_servicio',
        column: col('descuento_fuera_lima', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'valorizacion',
        column: col('reajuste', 'numeric', {
          notNull: true,
          default: lit('0'),
          codecRef: { codecId: 'pg/numeric@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
