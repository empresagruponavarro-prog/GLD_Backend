#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract';
import endContract from '../../snapshots/26ae9fb3276678f1d0fb646f4495fc17ea95c93c734aa08581c0fd0f7af67753/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e70f0760959348560d5dcc8370aec2544a0b321e39fe0f16a140d845950a4734/contract';
import startContract from '../../snapshots/e70f0760959348560d5dcc8370aec2544a0b321e39fe0f16a140d845950a4734/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'obra_aviso_usuario',
        columns: [
          col('id_usuario', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('tipos_importantes', 'character varying(200)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('visto_hasta', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
        ],
        constraints: [primaryKey(['id_usuario'])],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_aviso_usuario',
        foreignKey: {
          name: 'obra_aviso_usuario_id_usuario_fkey',
          columns: ['id_usuario'],
          references: { schema: 'public', table: 'usuarios', columns: ['IdUsuario'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
