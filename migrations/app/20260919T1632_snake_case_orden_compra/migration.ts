#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/e84396578ce13b50b58808129c268bfc1f55607bc6f5a515b90ff8767f7b586d/contract';
import startContract from '../../snapshots/e84396578ce13b50b58808129c268bfc1f55607bc6f5a515b90ff8767f7b586d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/f0299c450ba4608e0c5a42cff848e2791669b4ccd65dc8e06fa66630fdb68422/contract';
import endContract from '../../snapshots/f0299c450ba4608e0c5a42cff848e2791669b4ccd65dc8e06fa66630fdb68422/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

// Prisma no detecta renames: el planner propone drop + add (destructivo), asi que
// cada cambio se reescribe como ALTER TABLE ... RENAME COLUMN para conservar los datos.
const RENAMES: ReadonlyArray<readonly [from: string, to: string]> = [
  ['Comentarios', 'comentarios'],
  ['Cotizacion', 'cotizacion'],
  ['DsctoCompras', 'dscto_compras'],
  ['DsctoIntervencion', 'dscto_intervencion'],
  ['DsctoOtros', 'dscto_otros'],
  ['FechaCreacion', 'fecha_creacion'],
  ['FechaEmision', 'fecha_emision'],
  ['FormaPago', 'forma_pago'],
  ['HoraCreacion', 'hora_creacion'],
  ['IGV', 'igv'],
  ['IdOC', 'id_oc'],
  ['Mes', 'mes'],
  ['MonedaId', 'moneda_id'],
  ['MonedaSimbolo', 'moneda_simbolo'],
  ['Monto', 'monto'],
  ['NumeroOC', 'numero_oc'],
  ['OCPDF', 'oc_pdf'],
  ['Periodo', 'periodo'],
  ['Renta4ta', 'renta_4ta'],
  ['TipoCosto', 'tipo_costo'],
  ['TipoOC', 'tipo_oc'],
  ['Total', 'total'],
  ['Usuario', 'usuario'],
];

const columnExists = (alias: string) =>
  `EXISTS (
    SELECT 1 AS "one" FROM "information_schema"."columns"
    WHERE "table_schema" = $1 AND "table_name" = $2 AND "column_name" = ${alias}
  )`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return RENAMES.map(([from, to]) =>
      rawSql({
        id: `rename.ordenCompra.${from}.${to}`,
        label: `Rename column "${from}" to "${to}"`,
        summary: `Renombra ordenCompra."${from}" a "${to}" conservando los datos`,
        operationClass: 'widening',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: to,
            table: 'ordenCompra',
          },
        },
        precheck: [
          {
            description: `ensure "${from}" exists and "${to}" does not`,
            sql: `SELECT (${columnExists('$3')} AND NOT ${columnExists('$4')}) AS "result"`,
            params: ['public', 'ordenCompra', from, to],
          },
        ],
        execute: [
          {
            description: `rename column "${from}" to "${to}"`,
            sql: `ALTER TABLE "public"."ordenCompra" RENAME COLUMN "${from}" TO "${to}"`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: `verify column "${to}" exists`,
            sql: `SELECT ${columnExists('$3')} AS "result"`,
            params: ['public', 'ordenCompra', to],
          },
        ],
      }),
    );
  }
}

MigrationCLI.run(import.meta.url, M);
