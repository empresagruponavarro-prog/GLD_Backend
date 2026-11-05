#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/b1e0b7fd38e5febde01fd50ae5d9b9e1c73d23c402515c6c67d8d1140553396c/contract';
import endContract from '../../snapshots/b1e0b7fd38e5febde01fd50ae5d9b9e1c73d23c402515c6c67d8d1140553396c/contract.json' with { type: 'json' };
import startContract from '../../snapshots/b1e0b7fd38e5febde01fd50ae5d9b9e1c73d23c402515c6c67d8d1140553396c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * GRP · M4 — inicio y menú (T70, DG11, SP-10). Solo datos, idempotente:
 *  - Desactiva el módulo `dashboard` (Dashboard Situacional): la pantalla y su menú se retiran; **no** se borra el módulo
 *    ni sus permisos históricos.
 *  - «Solo consulta» en Centros de Costos: Promotor, Supervisor y Usuario pasan de crear/editar/eliminar a solo `ver`
 *    (el Administrador no tiene filas: su acceso es implícito).
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.grp.inicio-y-menu',
        label: 'GRP M4: desactiva dashboard y deja Centros de Costos en solo consulta',
        summary: 'modulo.dashboard.activo = false; Promotor, Supervisor y Usuario sin crear/editar/eliminar en centros-costos',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'grp-inicio-y-menu',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'modulo' } },
        precheck: [],
        execute: [
          {
            description: 'desactivar el módulo dashboard',
            sql: `UPDATE "public"."modulo" SET activo = false WHERE clave = 'dashboard' AND activo = true`,
            params: [],
          },
          {
            description: 'centros-costos en solo consulta para Promotor, Supervisor y Usuario',
            sql: `UPDATE "public"."rol_permiso" SET crear = false, editar = false, eliminar = false
                   WHERE modulo_id = (SELECT id FROM "public"."modulo" WHERE clave = 'centros-costos')
                     AND rol_id IN (SELECT id FROM "public"."rol" WHERE nombre IN ('Promotor', 'Supervisor', 'Usuario'))
                     AND (crear OR editar OR eliminar)`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'dashboard inactivo y esos roles sin escritura en centros-costos',
            sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."modulo" WHERE clave = 'dashboard' AND activo)
                    AND NOT EXISTS (
                      SELECT 1 FROM "public"."rol_permiso" p
                        JOIN "public"."modulo" m ON m.id = p.modulo_id AND m.clave = 'centros-costos'
                        JOIN "public"."rol" r ON r.id = p.rol_id AND r.nombre IN ('Promotor', 'Supervisor', 'Usuario')
                       WHERE p.crear OR p.editar OR p.eliminar) AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
