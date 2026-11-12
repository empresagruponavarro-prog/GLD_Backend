#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/3ee462c8e7bd29067f4ac4cade42f49ce1ac0a34d4bb2d23145ba9d9b70423f9/contract';
import endContract from '../../snapshots/3ee462c8e7bd29067f4ac4cade42f49ce1ac0a34d4bb2d23145ba9d9b70423f9/contract.json' with { type: 'json' };
import startContract from '../../snapshots/3ee462c8e7bd29067f4ac4cade42f49ce1ac0a34d4bb2d23145ba9d9b70423f9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Planos de obra · Versión K: la lista oficial de TIENDAS TAMBO (21 planos, todos obligatorios) reemplaza en TAMBO a las
 * 6 disciplinas temporales de `20261105T0241_grp_cadena_obra` (ARQ, EST, ELE, SAN, MEC, DET), que siguen en el catálogo
 * para ARUMA, MASS y OTROS. Las obras de TAMBO ya creadas reciben los 21 planos y pierden las disciplinas que no habían
 * entregado (lo entregado se conserva, igual que al cambiar el tipo de proyecto). Solo datos e idempotente.
 */
const PLANOS: ReadonlyArray<readonly [string, string, string]> = [
  ['A01', 'PLANO DE DISTRIBUCIÓN', 'ARQUITECTURA'],
  ['A02', 'PLANO DE ELEVACIONES', 'ARQUITECTURA'],
  ['A03', 'PLANO DE CORTES', 'ARQUITECTURA'],
  ['SE01', 'PLANO DE EVACUACIÓN', 'ARQUITECTURA'],
  ['SE02', 'PLANO DE SEÑALÉTICAS', 'ARQUITECTURA'],
  ['SE03', 'PLANO DE RIESGOS', 'ARQUITECTURA'],
  ['IS01', 'PLANO DE DESAGÜE', 'SANITARIAS'],
  ['IS02', 'PLANO DE AGUA', 'SANITARIAS'],
  ['IE01', 'PLANO DE LUMINARIAS', 'ELÉCTRICAS'],
  ['IE02', 'PLANO DE TOMACORRIENTES', 'ELÉCTRICAS'],
  ['IE03', 'PLANO DE FUERZAS', 'ELÉCTRICAS'],
  ['IE04', 'DIAGRAMA UNIFILAR', 'ELÉCTRICAS'],
  ['IE05', 'CUADRO DE CARGAS', 'ELÉCTRICAS'],
  ['IE06', 'PLANO DE REGISTROS DE POZO', 'ELÉCTRICAS'],
  ['HVAC01', 'PLANO DE CLIMATIZACIÓN', 'ELÉCTRICAS'],
  ['DA01', 'PLANO DE DATA', 'ELÉCTRICAS'],
  ['CO01', 'PLANO DE ALARMAS', 'ELÉCTRICAS'],
  ['E01', 'PLANO E01', 'ESTRUCTURAS'],
  ['E02', 'PLANO E02', 'ESTRUCTURAS'],
  ['E03', 'PLANO E03', 'ESTRUCTURAS'],
  ['E04', 'PLANO E04', 'ESTRUCTURAS'],
];
const DISCIPLINAS_VIEJAS = ['ARQ', 'EST', 'ELE', 'SAN', 'MEC', 'DET'] as const;

const lista = (cs: readonly string[]) => cs.map((c) => `'${c}'`).join(', ');
const CODIGOS = lista(PLANOS.map(([c]) => c));
const VIEJAS = lista(DISCIPLINAS_VIEJAS);
const TAMBO = `(SELECT "id" FROM "public"."tipo_proyecto" WHERE "nombre" = 'TAMBO')`;
const OBRAS_TAMBO = `(SELECT "id" FROM "public"."CentroCostos" WHERE "id_tipo_proyecto" = ${TAMBO})`;

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.tambo.planos_individuales',
        label: 'Lista oficial de planos de TIENDAS TAMBO',
        summary: '21 planos de TAMBO (todos obligatorios) en el catálogo, en el tipo de proyecto y en sus obras',
        operationClass: 'data',
        // El contrato no cambia (from = to): el invariante hace que la ruta de migración incluya esta migración.
        invariantId: 'tambo-planos-individuales',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'tipo_plano' } },
        precheck: [],
        execute: [
          {
            description: 'catálogo: los 21 planos de TAMBO',
            sql: `INSERT INTO "public"."tipo_plano" ("codigo", "nombre", "disciplina", "orden") VALUES ${PLANOS.map(
              ([c, n, d], i) => `('${c}', '${n}', '${d}', ${101 + i})`,
            ).join(', ')} ON CONFLICT ("codigo") DO NOTHING`,
            params: [],
          },
          {
            description: 'TAMBO deja de pedir las 6 disciplinas temporales',
            sql: `DELETE FROM "public"."tipo_proyecto_plano" WHERE "id_tipo_proyecto" = ${TAMBO}
                  AND "id_tipo_plano" IN (SELECT "id" FROM "public"."tipo_plano" WHERE "codigo" IN (${VIEJAS}))`,
            params: [],
          },
          {
            description: 'TAMBO pide los 21 planos, todos obligatorios',
            sql: `INSERT INTO "public"."tipo_proyecto_plano" ("id_tipo_proyecto", "id_tipo_plano", "obligatorio")
                  SELECT p."id", t."id", true FROM "public"."tipo_proyecto" p CROSS JOIN "public"."tipo_plano" t
                  WHERE p."nombre" = 'TAMBO' AND t."codigo" IN (${CODIGOS})
                  ON CONFLICT ("id_tipo_proyecto", "id_tipo_plano") DO UPDATE SET "obligatorio" = true`,
            params: [],
          },
          {
            description: 'obras de TAMBO: agregan los 21 planos',
            sql: `INSERT INTO "public"."obra_plano_requerido" ("id_centro_costo", "id_tipo_plano", "obligatorio")
                  SELECT cc."id", t."id", true FROM "public"."CentroCostos" cc CROSS JOIN "public"."tipo_plano" t
                  WHERE cc."id" IN ${OBRAS_TAMBO} AND t."codigo" IN (${CODIGOS})
                  ON CONFLICT ("id_centro_costo", "id_tipo_plano") DO UPDATE SET "obligatorio" = true`,
            params: [],
          },
          {
            description: 'obras de TAMBO: quitan las disciplinas temporales no entregadas',
            sql: `DELETE FROM "public"."obra_plano_requerido" WHERE "id_centro_costo" IN ${OBRAS_TAMBO} AND NOT "entregado"
                  AND "id_tipo_plano" IN (SELECT "id" FROM "public"."tipo_plano" WHERE "codigo" IN (${VIEJAS}))`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'los 21 planos existen y TAMBO (si existe) pide exactamente esos, todos obligatorios',
            sql: `SELECT (SELECT count(*) FROM "public"."tipo_plano" WHERE "codigo" IN (${CODIGOS})) = ${PLANOS.length}
                  AND (NOT EXISTS (SELECT 1 FROM "public"."tipo_proyecto" WHERE "nombre" = 'TAMBO') OR (
                    (SELECT count(*) FROM "public"."tipo_proyecto_plano" tp JOIN "public"."tipo_plano" t ON t."id" = tp."id_tipo_plano"
                     WHERE tp."id_tipo_proyecto" = ${TAMBO} AND t."codigo" IN (${CODIGOS}) AND tp."obligatorio") = ${PLANOS.length}
                    AND NOT EXISTS (SELECT 1 FROM "public"."tipo_proyecto_plano" tp JOIN "public"."tipo_plano" t ON t."id" = tp."id_tipo_plano"
                     WHERE tp."id_tipo_proyecto" = ${TAMBO} AND t."codigo" IN (${VIEJAS})))) AS "result"`,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
