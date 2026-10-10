#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/58a53db16b943e22fc39d93c3ea0b2939491b3493ef95c3be42ab7d85f3400a7/contract';
import endContract from '../../snapshots/58a53db16b943e22fc39d93c3ea0b2939491b3493ef95c3be42ab7d85f3400a7/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f55820469a372da13106b3f628335d7097abb066e6fee335d5786f3fdfb3b90e/contract';
import startContract from '../../snapshots/f55820469a372da13106b3f628335d7097abb066e6fee335d5786f3fdfb3b90e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleFases',
        column: col('id_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        column: col('id_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Plantillas_Categorias',
        column: col('id_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Principal',
        column: col('id_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleFases',
        index: 'ppto_DetalleFases_id_categoria_idx_dc879264',
        columns: ['id_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        index: 'ppto_DetalleFasesCate_id_categoria_idx_dc879264',
        columns: ['id_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Plantillas_Categorias',
        index: 'ppto_Plantillas_Categorias_id_categoria_idx_dc879264',
        columns: ['id_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Principal',
        index: 'ppto_Principal_id_categoria_idx_dc879264',
        columns: ['id_categoria'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleFases',
        foreignKey: {
          name: 'ppto_DetalleFases_id_categoria_fkey',
          columns: ['id_categoria'],
          references: { schema: 'public', table: 'categoria', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        foreignKey: {
          name: 'ppto_DetalleFasesCate_id_categoria_fkey',
          columns: ['id_categoria'],
          references: { schema: 'public', table: 'categoria', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Plantillas_Categorias',
        foreignKey: {
          name: 'ppto_Plantillas_Categorias_id_categoria_fkey',
          columns: ['id_categoria'],
          references: { schema: 'public', table: 'categoria', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Principal',
        foreignKey: {
          name: 'ppto_Principal_id_categoria_fkey',
          columns: ['id_categoria'],
          references: { schema: 'public', table: 'categoria', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
