#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/4ada217dde77de1c97fc3f38b647aa59c886e577f9d6fa7954ae829842fa2fc9/contract';
import endContract from '../../snapshots/4ada217dde77de1c97fc3f38b647aa59c886e577f9d6fa7954ae829842fa2fc9/contract.json' with { type: 'json' };
import startContract from '../../snapshots/4ada217dde77de1c97fc3f38b647aa59c886e577f9d6fa7954ae829842fa2fc9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Módulo «Catálogo de categorías» (Proyectos): pantalla para ver y mantener las categorías de bienes y servicios
 * (`categoria`). Solo datos e idempotente; sin permisos por defecto: solo el Administrador (otros roles lo reciben
 * desde Roles y permisos).
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.modulo.proyectos_categorias',
        label: 'Módulo «Catálogo de categorías»',
        summary: 'Inserta el módulo proyectos.categorias en la tabla modulo',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'modulo-categorias',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'Módulo proyectos.categorias',
            sql: `INSERT INTO "public"."modulo" ("clave", "nombre", "grupo", "ruta", "orden", "admite_aprobar", "admite_anular")
                  VALUES ('proyectos.categorias', 'Catálogo de categorías', 'Proyectos', '/maestros-generales/categorias', 42, false, false)
                  ON CONFLICT ("clave") DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'el módulo existe',
            sql: `SELECT EXISTS (SELECT 1 FROM "public"."modulo" WHERE "clave" = 'proyectos.categorias') AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
