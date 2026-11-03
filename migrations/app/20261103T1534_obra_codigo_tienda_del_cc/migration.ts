#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract';
import endContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import startContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/** La tienda es el nombre del centro de costo, sin espacios sobrantes y recortado a 80 (tope de la columna). */
const TIENDA_DEL_CC = `NULLIF(left(btrim(c.centro_costo), 80), '')`;

/**
 * Ficha de obra: código y tienda pasan a salir del centro de costo (código = id del CC, tienda = su nombre).
 * Corrige los que se escribieron a mano (p. ej. CC 969: «989» → «969», «RAH PERU LA MOLINA» → «RASH PERU LA MOLINA»).
 * Primero vacía los códigos que no coinciden para no chocar con el índice único al reasignarlos. Idempotente.
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.obra.codigo-tienda-del-cc',
        label: 'Código y tienda de la ficha de obra desde el centro de costo',
        summary: 'codigo_obra = id del centro de costo y tienda = nombre del centro de costo en obra_datos_generales',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'obra-codigo-tienda-del-cc',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'obra_datos_generales' } },
        precheck: [],
        execute: [
          {
            description: 'vaciar los códigos que no son el id del centro de costo',
            sql: `UPDATE "public"."obra_datos_generales" SET codigo_obra = NULL WHERE codigo_obra IS DISTINCT FROM id_centro_costo::text`,
            params: [],
          },
          {
            description: 'código = id y tienda = nombre del centro de costo',
            sql: `UPDATE "public"."obra_datos_generales" g SET codigo_obra = c.id::text, tienda = ${TIENDA_DEL_CC} FROM "public"."CentroCostos" c WHERE c.id = g.id_centro_costo AND (g.codigo_obra IS DISTINCT FROM c.id::text OR g.tienda IS DISTINCT FROM ${TIENDA_DEL_CC})`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'todas las fichas tienen el código y la tienda de su centro de costo',
            sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."obra_datos_generales" g JOIN "public"."CentroCostos" c ON c.id = g.id_centro_costo WHERE g.codigo_obra IS DISTINCT FROM c.id::text OR g.tienda IS DISTINCT FROM ${TIENDA_DEL_CC}) AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
