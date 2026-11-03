#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract';
import endContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import startContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Repone la semilla de `20261007T0144_control_almacen` (almacenes, correlativos y familias), copiada tal cual: en las
 * bases que llegaron a ese contrato con `prisma db update` (local y servidor) nunca se ejecutó. No pisa lo que ya
 * exista (ON CONFLICT DO NOTHING): un almacén con el mismo código conserva su nombre. Idempotente.
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.control_almacen.semillas.reponer',
        label: 'Repone almacenes, correlativos y familias',
        summary: 'Inserta almacenes iniciales, series de correlativos y familias (prefijos CON, HER, ...) que falten',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'almacen-semillas',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'almacen' } },
        precheck: [],
        execute: [
          {
            description: 'seed almacenes',
            sql: "INSERT INTO \"public\".\"almacen\" (codigo, nombre) VALUES ('ALM-GENERAL','Almacén General'),('ALM-GEN1','General 1'),('ALM-GEN2','General 2'),('ALM-TAMBO','Tambo'),('ALM-ARUMA','Aruma'),('ALM-MASS','Mass'),('ALM-VALIDAR','Por validar') ON CONFLICT (codigo) DO NOTHING",
            params: [],
          },
          {
            description: 'seed correlativos',
            sql: "INSERT INTO \"public\".\"almacen_correlativo\" (serie, ultimo) VALUES ('ING',0),('SAL',0),('TRF',0),('PRE',0) ON CONFLICT (serie) DO NOTHING",
            params: [],
          },
          {
            description: 'seed familias',
            sql: "INSERT INTO \"public\".\"familia_almacen\" (prefijo, nombre) VALUES ('CON','CONSUMIBLES'),('HER','HERRAMIENTAS'),('EPP','EPPS'),('TAM','TAMBO'),('ARU','ARUMA'),('MAS','MASS'),('FER','FERRETERIA'),('ELE','HERRAMIENTAS ELECTRICAS'),('EQU','EQUIPOS VARIOS') ON CONFLICT (prefijo) DO NOTHING",
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'los 7 almacenes, las 4 series y las 9 familias existen',
            sql: `SELECT (SELECT count(*) FROM "public"."almacen" WHERE codigo IN ('ALM-GENERAL','ALM-GEN1','ALM-GEN2','ALM-TAMBO','ALM-ARUMA','ALM-MASS','ALM-VALIDAR')) = 7 AND (SELECT count(*) FROM "public"."almacen_correlativo" WHERE serie IN ('ING','SAL','TRF','PRE')) = 4 AND (SELECT count(*) FROM "public"."familia_almacen" WHERE prefijo IN ('CON','HER','EPP','TAM','ARU','MAS','FER','ELE','EQU')) = 9 AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
