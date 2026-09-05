#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/d66a410c0a0ccb1017a95611a2aa912a426ab9bc461142859c34e8c968d79b6b/contract';
import endContract from '../../snapshots/d66a410c0a0ccb1017a95611a2aa912a426ab9bc461142859c34e8c968d79b6b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e079c776e75cad27cba358a452d5cedb8948f06a894ebb7061c8e14f3ceb99fa/contract';
import startContract from '../../snapshots/e079c776e75cad27cba358a452d5cedb8948f06a894ebb7061c8e14f3ceb99fa/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'producto',
        column: col('estado', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'tipo_categoria',
        column: col('estado', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'unidad_medida',
        column: col('estado', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        column: col('estado', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
