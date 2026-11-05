#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b1e0b7fd38e5febde01fd50ae5d9b9e1c73d23c402515c6c67d8d1140553396c/contract';
import endContract from '../../snapshots/b1e0b7fd38e5febde01fd50ae5d9b9e1c73d23c402515c6c67d8d1140553396c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract';
import startContract from '../../snapshots/f83172668560b02d2a9178f94dfa055a44a2c5e3772a2d7a5944c1adc56d4539/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

/**
 * GRP · M1 — datos que acompañan al esquema (todo idempotente).
 *  - Normaliza `ppto_Principal.estado_ppto` desde el `Estado` legado (DG1).
 *  - Copia el monto de la categoría a las subpartidas ya importadas (peso por monto, DG3).
 *  - Semillas TEMPORALES de tipos de proyecto y de plano (SP-06) hasta que el área técnica envíe la lista oficial.
 *  - Años fiscales 2024–2027 y módulos de permisos.
 * No cambia permisos existentes ni desactiva el Dashboard Situacional: eso va en F7, junto con el cambio de inicio y menú.
 */
const PLANOS: ReadonlyArray<readonly [string, string, boolean]> = [
  ['ARQ', 'ARQUITECTURA', true],
  ['EST', 'ESTRUCTURAS', true],
  ['ELE', 'INSTALACIONES ELÉCTRICAS', true],
  ['SAN', 'INSTALACIONES SANITARIAS', true],
  ['MEC', 'INSTALACIONES MECÁNICAS', false],
  ['DET', 'DETALLES CONSTRUCTIVOS', false],
];
const PROYECTOS = ['TAMBO', 'ARUMA', 'MASS', 'OTROS'] as const;
const ANIOS = [2024, 2025, 2026, 2027] as const;

const comillas = (t: string) => t.replace(/'/g, "''");
const dato = (
  id: string,
  label: string,
  tabla: string,
  sql: string,
  postcheck: string,
  invariantId?: string,
) =>
  rawSql({
    id,
    label,
    summary: label,
    operationClass: 'data',
    ...(invariantId ? { invariantId } : {}),
    target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: tabla } },
    precheck: [],
    execute: [{ description: label, sql, params: [] }],
    postcheck: [{ description: `verify ${label}`, sql: postcheck, params: [] }],
  });

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'obra_plano_requerido',
        columns: [
          col('entregado', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('entregado_en', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('entregado_por', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_plano', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_tipo_plano', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('obligatorio', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'periodo_fiscal',
        columns: [
          col('activo', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('anio', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['anio'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'tipo_plano',
        columns: [
          col('activo', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('codigo', 'character varying(20)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('disciplina', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(120)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 120 } },
          }),
          col('orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'tipo_proyecto',
        columns: [
          col('activo', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'character varying(80)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 80 } },
          }),
          col('orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'tipo_proyecto_plano',
        columns: [
          col('id_tipo_plano', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_tipo_proyecto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('obligatorio', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
        ],
        constraints: [primaryKey(['id_tipo_proyecto', 'id_tipo_plano'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'CentroCostos',
        column: col('fecha_liquidacion', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'CentroCostos',
        column: col('id_tipo_proyecto', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'CentroCostos',
        column: col('liquidado_por', 'character varying(255)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'almacen_documento_detalle',
        column: col('id_ppto_detalle_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_residentes',
        column: col('activo', 'bool', {
          notNull: true,
          default: lit(true),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_residentes',
        column: col('fecha_alta', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_residentes',
        column: col('fecha_baja', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_residentes',
        column: col('rol_equipo', 'character varying(30)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 30 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'obra_subpartida',
        column: col('monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ordenCompraDetalle',
        column: col('id_ppto_detalle_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Principal',
        column: col('aprobado_por', 'character varying(255)', {
          codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Principal',
        column: col('estado_ppto', 'text', {
          notNull: true,
          default: lit('EN_DESARROLLO'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Principal',
        column: col('fecha_aprobacion', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Principal',
        column: col('id_version_de', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Principal',
        column: col('numero_version', 'int4', {
          notNull: true,
          default: lit(1),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'requerimiento_detalle',
        column: col('id_ppto_detalle_categoria', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'obra_plano_requerido',
        constraint: 'obra_plano_requerido_id_centro_costo_id_tipo_plano_key',
        columns: ['id_centro_costo', 'id_tipo_plano'],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'ppto_Principal',
        constraint: 'ppto_Principal_estado_ppto_check_3e2f5708',
        expression:
          "\"estado_ppto\" IN ('EN_DESARROLLO', 'EN_REVISION', 'OBSERVADO', 'APROBADO', 'ENTREGADO', 'LIQUIDADO', 'ANULADO')",
      }),
      this.addUnique({
        schema: 'public',
        table: 'tipo_plano',
        constraint: 'tipo_plano_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'tipo_proyecto',
        constraint: 'tipo_proyecto_nombre_key',
        columns: ['nombre'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CentroCostos',
        index: 'CentroCostos_id_tipo_proyecto_idx_555c1d8a',
        columns: ['id_tipo_proyecto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacen_documento_detalle',
        index: 'almacen_doc_det_subfase_idx',
        columns: ['id_ppto_detalle_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_plano_requerido',
        index: 'obra_plano_requerido_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_plano_requerido',
        index: 'obra_plano_requerido_id_tipo_plano_idx_1ae34369',
        columns: ['id_tipo_plano'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompraDetalle',
        index: 'ordenCompraDetalle_id_ppto_detalle_categoria_idx_5963aa86',
        columns: ['id_ppto_detalle_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Principal',
        index: 'ppto_Principal_id_version_de_idx_642ba035',
        columns: ['id_version_de'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'requerimiento_detalle',
        index: 'requerimiento_detalle_id_ppto_detalle_categoria_idx_5963aa86',
        columns: ['id_ppto_detalle_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'tipo_proyecto_plano',
        index: 'tipo_proyecto_plano_id_tipo_plano_idx_1ae34369',
        columns: ['id_tipo_plano'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'tipo_proyecto_plano',
        index: 'tipo_proyecto_plano_id_tipo_proyecto_idx_555c1d8a',
        columns: ['id_tipo_proyecto'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacen_documento_detalle',
        foreignKey: {
          name: 'almacen_documento_detalle_id_ppto_detalle_categoria_fkey',
          columns: ['id_ppto_detalle_categoria'],
          references: { schema: 'public', table: 'ppto_DetalleFasesCate', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_plano_requerido',
        foreignKey: {
          name: 'obra_plano_requerido_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_plano_requerido',
        foreignKey: {
          name: 'obra_plano_requerido_id_tipo_plano_fkey',
          columns: ['id_tipo_plano'],
          references: { schema: 'public', table: 'tipo_plano', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompraDetalle',
        foreignKey: {
          name: 'ordenCompraDetalle_id_ppto_detalle_categoria_fkey',
          columns: ['id_ppto_detalle_categoria'],
          references: { schema: 'public', table: 'ppto_DetalleFasesCate', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Principal',
        foreignKey: {
          name: 'ppto_Principal_id_version_de_fkey',
          columns: ['id_version_de'],
          references: { schema: 'public', table: 'ppto_Principal', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'requerimiento_detalle',
        foreignKey: {
          name: 'requerimiento_detalle_id_ppto_detalle_categoria_fkey',
          columns: ['id_ppto_detalle_categoria'],
          references: { schema: 'public', table: 'ppto_DetalleFasesCate', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CentroCostos',
        foreignKey: {
          name: 'CentroCostos_id_tipo_proyecto_fkey',
          columns: ['id_tipo_proyecto'],
          references: { schema: 'public', table: 'tipo_proyecto', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'tipo_proyecto_plano',
        foreignKey: {
          name: 'tipo_proyecto_plano_id_tipo_proyecto_fkey',
          columns: ['id_tipo_proyecto'],
          references: { schema: 'public', table: 'tipo_proyecto', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'tipo_proyecto_plano',
        foreignKey: {
          name: 'tipo_proyecto_plano_id_tipo_plano_fkey',
          columns: ['id_tipo_plano'],
          references: { schema: 'public', table: 'tipo_plano', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      // ── Datos ──────────────────────────────────────────────────────────────────────────────────────────────
      dato(
        'data.ppto_principal.estado_ppto',
        'Normaliza el estado de los presupuestos (DG1)',
        'ppto_Principal',
        `UPDATE "public"."ppto_Principal" SET "estado_ppto" = CASE translate(upper(btrim(replace(coalesce("Estado", ''), '_', ' '))), 'Ó', 'O')
           WHEN 'APROBADO' THEN 'APROBADO'
           WHEN 'EN REVISION' THEN 'EN_REVISION'
           WHEN 'REVISION' THEN 'EN_REVISION'
           WHEN 'OBSERVADO' THEN 'OBSERVADO'
           WHEN 'ENTREGADO' THEN 'ENTREGADO'
           WHEN 'LIQUIDADO' THEN 'LIQUIDADO'
           WHEN 'ANULADO' THEN 'ANULADO'
           ELSE 'EN_DESARROLLO' END
         WHERE "estado_ppto" = 'EN_DESARROLLO'`,
        `SELECT NOT EXISTS (SELECT 1 FROM "public"."ppto_Principal" WHERE upper("Estado") = 'APROBADO' AND "estado_ppto" <> 'APROBADO') AS "result"`,
      ),
      dato(
        'data.obra_subpartida.monto',
        'Copia el monto de la categoría a las subpartidas importadas (DG3)',
        'obra_subpartida',
        `UPDATE "public"."obra_subpartida" s SET "monto" = c."CostoDirecto"
         FROM "public"."ppto_DetalleFasesCate" c
         WHERE c."id" = s."id_ppto_detalle_categoria" AND s."monto" IS NULL AND c."CostoDirecto" IS NOT NULL`,
        `SELECT NOT EXISTS (SELECT 1 FROM "public"."obra_subpartida" s JOIN "public"."ppto_DetalleFasesCate" c ON c."id" = s."id_ppto_detalle_categoria" WHERE s."monto" IS NULL AND c."CostoDirecto" IS NOT NULL) AS "result"`,
      ),
      dato(
        'data.tipo_plano.semilla',
        'Tipos de plano iniciales (temporal, SP-06)',
        'tipo_plano',
        `INSERT INTO "public"."tipo_plano" ("codigo", "nombre", "disciplina", "orden") VALUES ${PLANOS.map(([c, n], i) => `('${c}', '${comillas(n)}', '${comillas(n)}', ${i + 1})`).join(', ')} ON CONFLICT ("codigo") DO NOTHING`,
        `SELECT (SELECT count(*) FROM "public"."tipo_plano" WHERE "codigo" IN (${PLANOS.map(([c]) => `'${c}'`).join(', ')})) = ${PLANOS.length} AS "result"`,
      ),
      dato(
        'data.tipo_proyecto.semilla',
        'Tipos de proyecto iniciales (temporal, SP-06)',
        'tipo_proyecto',
        `INSERT INTO "public"."tipo_proyecto" ("nombre", "orden") VALUES ${PROYECTOS.map((n, i) => `('${n}', ${i + 1})`).join(', ')} ON CONFLICT ("nombre") DO NOTHING`,
        `SELECT (SELECT count(*) FROM "public"."tipo_proyecto" WHERE "nombre" IN (${PROYECTOS.map((n) => `'${n}'`).join(', ')})) = ${PROYECTOS.length} AS "result"`,
      ),
      dato(
        'data.tipo_proyecto_plano.semilla',
        'Planos por tipo de proyecto iniciales (temporal, SP-06)',
        'tipo_proyecto_plano',
        `INSERT INTO "public"."tipo_proyecto_plano" ("id_tipo_proyecto", "id_tipo_plano", "obligatorio")
         SELECT p."id", t."id", t."codigo" IN (${PLANOS.filter(([, , o]) => o).map(([c]) => `'${c}'`).join(', ')})
         FROM "public"."tipo_proyecto" p CROSS JOIN "public"."tipo_plano" t
         WHERE p."nombre" IN (${PROYECTOS.map((n) => `'${n}'`).join(', ')}) AND t."codigo" IN (${PLANOS.map(([c]) => `'${c}'`).join(', ')})
         ON CONFLICT ("id_tipo_proyecto", "id_tipo_plano") DO NOTHING`,
        `SELECT (SELECT count(*) FROM "public"."tipo_proyecto_plano") >= ${PROYECTOS.length * PLANOS.length} AS "result"`,
      ),
      dato(
        'data.periodo_fiscal.semilla',
        'Años fiscales 2024–2027',
        'periodo_fiscal',
        `INSERT INTO "public"."periodo_fiscal" ("anio", "activo") VALUES ${ANIOS.map((a) => `(${a}, true)`).join(', ')} ON CONFLICT ("anio") DO NOTHING`,
        `SELECT (SELECT count(*) FROM "public"."periodo_fiscal" WHERE "anio" IN (${ANIOS.join(', ')})) = ${ANIOS.length} AS "result"`,
      ),
      dato(
        'data.modulo.aprobar',
        'Habilita la acción «aprobar» en presupuestos y obra (DG2)',
        'modulo',
        `UPDATE "public"."modulo" SET "admite_aprobar" = true WHERE "clave" IN ('presupuestos', 'obra')`,
        `SELECT (SELECT count(*) FROM "public"."modulo" WHERE "clave" IN ('presupuestos', 'obra') AND "admite_aprobar") = 2 AS "result"`,
      ),
      dato(
        'data.modulo.proyectos_catalogos',
        'Módulo «Catálogos de proyecto» (DG14); sin permisos por defecto: solo el Administrador',
        'modulo',
        `INSERT INTO "public"."modulo" ("clave", "nombre", "grupo", "ruta", "orden", "admite_aprobar", "admite_anular")
         VALUES ('proyectos.catalogos', 'Catálogos de proyecto', 'Proyectos', '/proyectos/catalogos', 41, false, false)
         ON CONFLICT ("clave") DO NOTHING`,
        `SELECT EXISTS (SELECT 1 FROM "public"."modulo" WHERE "clave" = 'proyectos.catalogos') AS "result"`,
      ),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
