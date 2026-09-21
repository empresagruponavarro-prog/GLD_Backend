#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a98b82d439259f84647bc4f70f2e14252855249ffcd29c33984af569a20b416f/contract';
import endContract from '../../snapshots/a98b82d439259f84647bc4f70f2e14252855249ffcd29c33984af569a20b416f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/c6b48f2dda32c46d4a3b335d5d5521865e12cfedaab2cf83d025fb8bc1a8fcb4/contract';
import startContract from '../../snapshots/c6b48f2dda32c46d4a3b335d5d5521865e12cfedaab2cf83d025fb8bc1a8fcb4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'documentosOrigen',
        constraint: 'documentosOrigen_id_detalle_fase_categoria_fkey',
        kind: 'foreignKey',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'documentosOrigen',
        index: 'documentosOrigen_id_detalle_fase_categoria_idx_c1fc72ce',
      }),
      this.dropColumn({
        schema: 'public',
        table: 'documentosOrigen',
        column: 'id_detalle_fase_categoria',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
