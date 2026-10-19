#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/03999aaba285f1f70263a03303adb61b7375d403cab165f80265644047fa622f/contract';
import startContract from '../../snapshots/03999aaba285f1f70263a03303adb61b7375d403cab165f80265644047fa622f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/1a0cd5bcd09a5124f42a9d2d8c6efbb3e8d212c6cd341bee61089fe0cb513814/contract';
import endContract from '../../snapshots/1a0cd5bcd09a5124f42a9d2d8c6efbb3e8d212c6cd341bee61089fe0cb513814/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

/** Unidades que usa el itemizado y aún no existen: [codigo, descripcion, simbolo]. */
const UNIDADES: ReadonlyArray<readonly [string, string, string]> = [
  ['GLB', 'Global', 'glb'],
  ['PTO', 'Punto', 'pto'],
  ['M3', 'Metro cubico', 'm3'],
  ['MES', 'Mes', 'mes'],
];

const VALORES_UNIDADES = UNIDADES.map(([c, d, s]) => `('${c}', '${d}', '${s}')`).join(', ');

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'ppto_DetalleItems',
        columns: [
          col('Cantidad', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('CostoTotal', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('CostoUnitario', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Item', 'character varying(20)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('Orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('PrecioVenta', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('VentaTotal', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_detalle_categoria', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_unidad_medida', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_Plantillas_Items',
        columns: [
          col('Cantidad', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('CostoTotal', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('CostoUnitario', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('Item', 'character varying(20)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
          col('Orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('PrecioVenta', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('VentaTotal', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_plantilla_categoria', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id_producto', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_unidad_medida', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleItems',
        index: 'ppto_DetalleItems_IdPresupuesto_idx_610007fd',
        columns: ['IdPresupuesto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleItems',
        index: 'ppto_DetalleItems_id_detalle_categoria_idx_e4765203',
        columns: ['id_detalle_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleItems',
        index: 'ppto_DetalleItems_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleItems',
        index: 'ppto_DetalleItems_id_unidad_medida_idx_e475ad90',
        columns: ['id_unidad_medida'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Plantillas_Items',
        index: 'ppto_Plantillas_Items_id_plantilla_categoria_idx_4793678f',
        columns: ['id_plantilla_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Plantillas_Items',
        index: 'ppto_Plantillas_Items_id_producto_idx_f4d96d2e',
        columns: ['id_producto'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Plantillas_Items',
        index: 'ppto_Plantillas_Items_id_unidad_medida_idx_e475ad90',
        columns: ['id_unidad_medida'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleItems',
        foreignKey: {
          name: 'ppto_DetalleItems_id_detalle_categoria_fkey',
          columns: ['id_detalle_categoria'],
          references: { schema: 'public', table: 'ppto_DetalleFasesCate', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleItems',
        foreignKey: {
          name: 'ppto_DetalleItems_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleItems',
        foreignKey: {
          name: 'ppto_DetalleItems_id_unidad_medida_fkey',
          columns: ['id_unidad_medida'],
          references: { schema: 'public', table: 'unidad_medida', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Plantillas_Items',
        foreignKey: {
          name: 'ppto_Plantillas_Items_id_plantilla_categoria_fkey',
          columns: ['id_plantilla_categoria'],
          references: { schema: 'public', table: 'ppto_Plantillas_Categorias', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Plantillas_Items',
        foreignKey: {
          name: 'ppto_Plantillas_Items_id_producto_fkey',
          columns: ['id_producto'],
          references: { schema: 'public', table: 'producto', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Plantillas_Items',
        foreignKey: {
          name: 'ppto_Plantillas_Items_id_unidad_medida_fkey',
          columns: ['id_unidad_medida'],
          references: { schema: 'public', table: 'unidad_medida', columns: ['id'] },
        },
      }),
      // Unidades del itemizado (se omiten si ya existe una con el mismo símbolo o código).
      rawSql({
        id: 'data.unidad_medida.itemizado',
        label: 'Unidades del itemizado',
        summary: 'Inserta GLB, PTO, M3 y MES si no existen',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'unidad_medida' } },
        precheck: [],
        execute: [
          {
            description: 'seed unidades itemizado',
            sql: [
              'INSERT INTO "public"."unidad_medida" (codigo, descripcion, simbolo)',
              `SELECT v.codigo, v.descripcion, v.simbolo FROM (VALUES ${VALORES_UNIDADES}) AS v(codigo, descripcion, simbolo)`,
              'WHERE NOT EXISTS (SELECT 1 FROM "public"."unidad_medida" u',
              'WHERE lower(u.simbolo) = lower(v.simbolo) OR u.codigo = v.codigo)',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [],
      }),
      // MILLAR compartía el símbolo "ML" con Metro Lineal; se cambia a "MLL".
      rawSql({
        id: 'data.unidad_medida.millar',
        label: 'Simbolo de MILLAR',
        summary: 'MILLAR pasa de ML a MLL para no chocar con Metro Lineal',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'unidad_medida' } },
        precheck: [],
        execute: [
          {
            description: 'fix simbolo millar',
            sql: `UPDATE "public"."unidad_medida" SET simbolo = 'MLL' WHERE upper(descripcion) = 'MILLAR' AND upper(simbolo) = 'ML'`,
            params: [],
          },
        ],
        postcheck: [],
      }),
      // Nueva categoría de costo del itemizado (pedido explícito: no reutilizar ESTR).
      rawSql({
        id: 'data.categoria.estructuras',
        label: 'Categoria 6. CD - ESTRUCTURAS',
        summary: 'Crea la categoria ESTRUC bajo COSTO DIRECTO - CONTRATISTA',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'categoria' } },
        precheck: [],
        execute: [
          {
            description: 'seed categoria estructuras',
            sql: [
              'INSERT INTO "public"."categoria" (codigo, id_tipo_categoria, descripcion)',
              "SELECT 'ESTRUC', tc.id, '6. CD - ESTRUCTURAS (PUERTAS,ENROLLABLES,COBERTURA,ESCALERA, OTRO)'",
              'FROM "public"."tipo_categoria" tc',
              "WHERE tc.nombre = 'COSTO DIRECTO - CONTRATISTA'",
              'ORDER BY tc.id LIMIT 1',
              'ON CONFLICT (codigo) DO NOTHING',
            ].join(' '),
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
