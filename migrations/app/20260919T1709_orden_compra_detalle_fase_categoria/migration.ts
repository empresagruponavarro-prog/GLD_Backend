#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2539bec1d18c34f1ccf90b3b5312cbaa365f932532822f19dd3c7c10881770b0/contract';
import startContract from '../../snapshots/2539bec1d18c34f1ccf90b3b5312cbaa365f932532822f19dd3c7c10881770b0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9c22b66ca727f927e26c72ec6831252d532092e662ff4c418bf0c2930d1b0080/contract';
import endContract from '../../snapshots/9c22b66ca727f927e26c72ec6831252d532092e662ff4c418bf0c2930d1b0080/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ordenCompra',
        column: col('id_detalle_fase_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompra',
        index: 'ordenCompra_id_detalle_fase_categoria_idx_c1fc72ce',
        columns: ['id_detalle_fase_categoria'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompra',
        foreignKey: {
          name: 'ordenCompra_id_detalle_fase_categoria_fkey',
          columns: ['id_detalle_fase_categoria'],
          references: { schema: 'public', table: 'ppto_DetalleFasesCate', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
