#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/61fb51a924e52f6ea2cddb424bb22ae2373832d5a73a086f1d0d291ab6d3940a/contract';
import startContract from '../../snapshots/61fb51a924e52f6ea2cddb424bb22ae2373832d5a73a086f1d0d291ab6d3940a/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b8157094014a418a94b6e6e8ab9d5fae548264060fa88216978a0d875f1b462f/contract';
import endContract from '../../snapshots/b8157094014a418a94b6e6e8ab9d5fae548264060fa88216978a0d875f1b462f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleFases',
        index: 'ppto_DetalleFases_IdPresupuesto_idx_610007fd',
        columns: ['IdPresupuesto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleFases',
        index: 'ppto_DetalleFases_IdpptoFase_idx_3132f24e',
        columns: ['IdpptoFase'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        index: 'ppto_DetalleFasesCate_IdPresupuestoDetalle_idx_03ca64c6',
        columns: ['IdPresupuestoDetalle'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        index: 'ppto_DetalleFasesCate_IdPresupuesto_idx_610007fd',
        columns: ['IdPresupuesto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_FasesCategorias',
        index: 'ppto_FasesCategorias_IdpptoFase_idx_3132f24e',
        columns: ['IdpptoFase'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Principal_Historial',
        index: 'ppto_Principal_Historial_IdPresupuesto_idx_610007fd',
        columns: ['IdPresupuesto'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleFases',
        foreignKey: {
          name: 'ppto_DetalleFases_IdPresupuesto_fkey',
          columns: ['IdPresupuesto'],
          references: { schema: 'public', table: 'ppto_Principal', columns: ['IdPresupuesto'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleFases',
        foreignKey: {
          name: 'ppto_DetalleFases_IdpptoFase_fkey',
          columns: ['IdpptoFase'],
          references: { schema: 'public', table: 'ppto_Fases', columns: ['IdpptoFase'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        foreignKey: {
          name: 'ppto_DetalleFasesCate_IdPresupuesto_fkey',
          columns: ['IdPresupuesto'],
          references: { schema: 'public', table: 'ppto_Principal', columns: ['IdPresupuesto'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        foreignKey: {
          name: 'ppto_DetalleFasesCate_IdPresupuestoDetalle_fkey',
          columns: ['IdPresupuestoDetalle'],
          references: {
            schema: 'public',
            table: 'ppto_DetalleFases',
            columns: ['IdPresupuestoDetalle'],
          },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_FasesCategorias',
        foreignKey: {
          name: 'ppto_FasesCategorias_IdpptoFase_fkey',
          columns: ['IdpptoFase'],
          references: { schema: 'public', table: 'ppto_Fases', columns: ['IdpptoFase'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Principal_Historial',
        foreignKey: {
          name: 'ppto_Principal_Historial_IdPresupuesto_fkey',
          columns: ['IdPresupuesto'],
          references: { schema: 'public', table: 'ppto_Principal', columns: ['IdPresupuesto'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
