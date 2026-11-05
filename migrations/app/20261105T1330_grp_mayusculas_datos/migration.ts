#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/b1e0b7fd38e5febde01fd50ae5d9b9e1c73d23c402515c6c67d8d1140553396c/contract';
import endContract from '../../snapshots/b1e0b7fd38e5febde01fd50ae5d9b9e1c73d23c402515c6c67d8d1140553396c/contract.json' with { type: 'json' };
import startContract from '../../snapshots/b1e0b7fd38e5febde01fd50ae5d9b9e1c73d23c402515c6c67d8d1140553396c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Lista blanca de textos libres que pasan a mayúsculas (GRP M3, S-11, DG9): nombres, descripciones y direcciones. NO se
 * tocan códigos, claves, correos, usuarios, enlaces, rutas, observaciones ni valores que el sistema compara tal cual
 * (estados, tipos, símbolos de unidades). Si se agrega una columna a esta lista, revisar antes que no sea única o que no
 * colisione al convertirla (T02 comprobó que ninguna de las actuales colisiona).
 */
export const LISTA_BLANCA: ReadonlyArray<readonly [tabla: string, columna: string]> = [
  ['CentroCostos', 'centro_costo'],
  ['anexos', 'Anexo'],
  ['anexos', 'NombreComercial'],
  ['producto', 'descripcion'],
  ['ppto_Principal', 'Proyecto'],
  ['ppto_Fases', 'FaseProyecto'],
  ['ppto_FasesCategorias', 'Descripcion'],
  ['obra_datos_generales', 'direccion'],
  ['obra_datos_generales', 'departamento'],
  ['obra_datos_generales', 'provincia'],
  ['obra_datos_generales', 'distrito'],
  ['obra_datos_generales', 'tienda'],
  ['obra_datos_generales', 'turno_trabajo'],
  ['obra_datos_generales', 'contacto_cliente_nombre'],
  ['obra_residentes', 'nombre_completo'],
  ['obra_residentes', 'especialidad'],
  ['obra_residentes', 'turno'],
  ['obra_partida', 'nombre'],
  ['obra_subpartida', 'nombre'],
  ['area', 'nombre'],
  ['almacen', 'nombre'],
];

const convertir = ([tabla, columna]: readonly [string, string]) => ({
  description: `${tabla}.${columna} en mayúsculas`,
  sql: `UPDATE "public"."${tabla}" SET "${columna}" = upper("${columna}") WHERE "${columna}" IS DISTINCT FROM upper("${columna}")`,
  params: [],
});

const pendientes = ([tabla, columna]: readonly [string, string]) =>
  `(SELECT count(*) FROM "public"."${tabla}" WHERE "${columna}" IS DISTINCT FROM upper("${columna}"))`;

/**
 * GRP · M3 — conversión de los datos ya guardados a mayúsculas, solo la lista blanca. Solo datos e idempotente: una segunda
 * ejecución no cambia nada. Si una conversión chocara con un índice único, la operación entera se revierte.
 * Hacer un `pg_dump` antes de aplicarla.
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.grp.mayusculas-datos',
        label: 'GRP M3: textos libres de la lista blanca en mayúsculas',
        summary: `UPDATE … SET col = upper(col) en ${LISTA_BLANCA.length} columnas (nombres, descripciones y direcciones)`,
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'grp-mayusculas-datos',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'CentroCostos' } },
        precheck: [],
        execute: LISTA_BLANCA.map(convertir),
        postcheck: [
          {
            description: 'ninguna columna de la lista blanca conserva minúsculas',
            sql: `SELECT (${LISTA_BLANCA.map(pendientes).join(' + ')}) = 0 AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
