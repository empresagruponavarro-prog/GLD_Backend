#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4094c875961b5775e82a7be4a8df6fc52e556211c0d44087739ef57ed74327d6/contract';
import startContract from '../../snapshots/4094c875961b5775e82a7be4a8df6fc52e556211c0d44087739ef57ed74327d6/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7d5f5baa87e6fee19d4133888ac7fe63daf16d060e663126fa0ba8b179b4bb38/contract';
import endContract from '../../snapshots/7d5f5baa87e6fee19d4133888ac7fe63daf16d060e663126fa0ba8b179b4bb38/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'rol',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('descripcion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('es_sistema', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(50)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'rol',
        constraint: 'rol_nombre_key',
        columns: ['nombre'],
      }),
      // Semilla idempotente del catalogo de roles (ON CONFLICT no pisa cambios posteriores).
      rawSql({
        id: 'data.rol.semilla',
        label: 'Semilla del catalogo de roles',
        summary: 'Inserta Administrador (sistema), Promotor, Supervisor y Usuario si no existen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'rol' } },
        precheck: [],
        execute: [
          {
            description: 'seed roles',
            sql: "INSERT INTO \"public\".\"rol\" (nombre, descripcion, es_sistema) VALUES ('Administrador', 'Acceso total, incluida la administración de usuarios y empresas', true), ('Promotor', NULL, false), ('Supervisor', NULL, false), ('Usuario', NULL, false) ON CONFLICT (nombre) DO NOTHING",
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
