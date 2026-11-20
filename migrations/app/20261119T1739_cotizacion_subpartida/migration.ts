#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/95d8dd49b8d938e3f1d287c0f3d601c004a4b00ba545824b578b5e45d9bf089a/contract';
import endContract from '../../snapshots/95d8dd49b8d938e3f1d287c0f3d601c004a4b00ba545824b578b5e45d9bf089a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f2b3f6cff647e74653da2b2af207be04dc1081128532faf01e7f553cab1a2d41/contract';
import startContract from '../../snapshots/f2b3f6cff647e74653da2b2af207be04dc1081128532faf01e7f553cab1a2d41/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'ppto_cotizacion',
        constraint: 'ppto_cotizacion_id_detalle_fase_id_proveedor_key',
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_cotizacion',
        column: col('id_detalle_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_cotizacion',
        column: col('prorrateada', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_cotizacion',
        column: col('total_global', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_cotizacion',
        constraint: 'ppto_cotizacion_id_detalle_categoria_id_proveedor_key',
        columns: ['id_detalle_categoria', 'id_proveedor'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_cotizacion',
        index: 'ppto_cotizacion_id_detalle_categoria_idx_e4765203',
        columns: ['id_detalle_categoria'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_cotizacion',
        foreignKey: {
          name: 'ppto_cotizacion_id_detalle_categoria_fkey',
          columns: ['id_detalle_categoria'],
          references: { schema: 'public', table: 'ppto_DetalleFasesCate', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
