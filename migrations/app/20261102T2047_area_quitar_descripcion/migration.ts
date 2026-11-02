#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/73e6fa47ad298b32c5cd5acc8de25f67f1ab9b97adb0541d5958b3e1fbd2ba29/contract';
import endContract from '../../snapshots/73e6fa47ad298b32c5cd5acc8de25f67f1ab9b97adb0541d5958b3e1fbd2ba29/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/8f4cf05305c3d9983e6dac2ea57d01bcef1c44e028d6f87413420627874c5d29/contract';
import startContract from '../../snapshots/8f4cf05305c3d9983e6dac2ea57d01bcef1c44e028d6f87413420627874c5d29/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [this.dropColumn({ schema: 'public', table: 'area', column: 'descripcion' })];
  }
}

MigrationCLI.run(import.meta.url, M);
