#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/f2b3f6cff647e74653da2b2af207be04dc1081128532faf01e7f553cab1a2d41/contract';
import endContract from '../../snapshots/f2b3f6cff647e74653da2b2af207be04dc1081128532faf01e7f553cab1a2d41/contract.json' with { type: 'json' };
import startContract from '../../snapshots/f2b3f6cff647e74653da2b2af207be04dc1081128532faf01e7f553cab1a2d41/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Plan 09 · M2 — datos de los FUR que «Generar FURs» ya había creado desde un presupuesto (solo datos, idempotente).
 *  - `requerimiento.id_ppto_principal` y `origen = 'PPTO_FASE'`, a partir de la marca `[Auto-Ppto: PPTO-…]` de la justificación.
 *  - `requerimiento_detalle.id_ppto_item`, cuando (presupuesto, producto, subfase) identifica un solo ítem del presupuesto.
 * Así «Generar FURs» no vuelve a pedir lo que esos FUR ya pidieron y los FUR muestran de qué presupuesto vienen.
 */
const ETIQUETA = `'^\\[Auto-Ppto: ([^\\]]+)\\]'`;

const SIN_ORIGEN = `SELECT 1 FROM "public"."requerimiento" r
    JOIN "public"."ppto_Principal" p ON p."IdPresupuesto" = substring(r."justificacion" from ${ETIQUETA})
   WHERE r."justificacion" ~ ${ETIQUETA} AND r."id_ppto_principal" IS NULL AND r."origen" = 'MANUAL'`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.ppto-cotizaciones.fur-origen',
        label: 'Marca los FUR generados desde un presupuesto con su presupuesto, origen e ítems',
        summary: 'requerimiento.id_ppto_principal / origen y requerimiento_detalle.id_ppto_item de los FUR «Auto-Ppto»',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'ppto-cotizaciones-datos',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'requerimiento' } },
        precheck: [],
        execute: [
          {
            description: 'FUR «Auto-Ppto»: presupuesto de origen y origen PPTO_FASE',
            sql: `UPDATE "public"."requerimiento" r
                     SET "id_ppto_principal" = p."id", "origen" = 'PPTO_FASE'
                    FROM "public"."ppto_Principal" p
                   WHERE r."justificacion" ~ ${ETIQUETA}
                     AND p."IdPresupuesto" = substring(r."justificacion" from ${ETIQUETA})
                     AND r."id_ppto_principal" IS NULL AND r."origen" = 'MANUAL'`,
            params: [],
          },
          {
            description: 'líneas de esos FUR: el ítem del presupuesto, si (presupuesto, producto, subfase) identifica uno solo',
            sql: `UPDATE "public"."requerimiento_detalle" d
                     SET "id_ppto_item" = c."id_item"
                    FROM (
                      SELECT rd."id" AS "id_linea", (array_agg(i."id"))[1] AS "id_item"
                        FROM "public"."requerimiento_detalle" rd
                        JOIN "public"."requerimiento" r ON r."id" = rd."id_requerimiento" AND r."origen" = 'PPTO_FASE' AND r."id_ppto_principal" IS NOT NULL
                        JOIN "public"."ppto_Principal" p ON p."id" = r."id_ppto_principal"
                        JOIN "public"."ppto_DetalleItems" i ON i."IdPresupuesto" = p."IdPresupuesto"
                                                          AND i."id_producto" = rd."id_producto"
                                                          AND i."id_detalle_categoria" = rd."id_ppto_detalle_categoria"
                       WHERE rd."id_ppto_item" IS NULL
                       GROUP BY rd."id" HAVING count(*) = 1
                    ) c
                   WHERE d."id" = c."id_linea"`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'no queda ningún FUR «Auto-Ppto» de un presupuesto existente sin su origen',
            sql: `SELECT NOT EXISTS (${SIN_ORIGEN}) AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
