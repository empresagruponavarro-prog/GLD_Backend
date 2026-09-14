#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8b3e1cec4d5db673b8e875630b9b075ad45b931f528b4608c7e752ba70b7eb04/contract';
import startContract from '../../snapshots/8b3e1cec4d5db673b8e875630b9b075ad45b931f528b4608c7e752ba70b7eb04/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/9460e42521ba61524810495ec94b80ee40cb96d4c0c4a4a933c35ce9edfdbbc1/contract';
import endContract from '../../snapshots/9460e42521ba61524810495ec94b80ee40cb96d4c0c4a4a933c35ce9edfdbbc1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'almacenMovimientos',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'cajaEgresosRetail',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'cajaIngresos',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'contrataciones_PPTOMeta',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'docCompra',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'docCompraDetalle',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'docVenta',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'docVentaDetalle',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'egresos_AnticiposOC',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ordenCompra',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleFases',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'ppto_Principal',
        column: col('id_centro_costo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),

      // Backfill: mapea cada "CodCentroCto" (código) al "id" de "CentroCostos".
      // Las filas cuyo código no exista en "CentroCostos" quedan con NULL
      // (la FK es nullable y ON DELETE SET NULL).
      rawSql({
        id: 'data.fk-id-centro-costo.backfill',
        label: 'Backfill id_centro_costo from CodCentroCto',
        summary: 'Traduce CodCentroCto (codigo) al id de "CentroCostos" en las 13 tablas que lo referencian',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            name: 'id_centro_costo',
            table: 'CentroCostos',
          },
        },
        precheck: [
          {
            description: 'ensure rows still pending backfill in almacenMovimientos',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in cajaEgresosRetail',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in cajaIngresos',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in contrataciones_PPTOMeta',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in docCompra',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in docCompraDetalle',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in docVenta',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in docVentaDetalle',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in egresos_AnticiposOC',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in ordenCompra',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in ppto_DetalleFases',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in ppto_DetalleFasesCate',
            sql: 'SELECT true AS "result"',
            params: [],
          },
          {
            description: 'ensure rows still pending backfill in ppto_Principal',
            sql: 'SELECT true AS "result"',
            params: [],
          },
        ],
        execute: [
          {
            description: 'copy mapped ids to almacenMovimientos',
            sql: 'UPDATE "public"."almacenMovimientos" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to cajaEgresosRetail',
            sql: 'UPDATE "public"."cajaEgresosRetail" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to cajaIngresos',
            sql: 'UPDATE "public"."cajaIngresos" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to contrataciones_PPTOMeta',
            sql: 'UPDATE "public"."contrataciones_PPTOMeta" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to docCompra',
            sql: 'UPDATE "public"."docCompra" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to docCompraDetalle',
            sql: 'UPDATE "public"."docCompraDetalle" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to docVenta',
            sql: 'UPDATE "public"."docVenta" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to docVentaDetalle',
            sql: 'UPDATE "public"."docVentaDetalle" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to egresos_AnticiposOC',
            sql: 'UPDATE "public"."egresos_AnticiposOC" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to ordenCompra',
            sql: 'UPDATE "public"."ordenCompra" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to ppto_DetalleFases',
            sql: 'UPDATE "public"."ppto_DetalleFases" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to ppto_DetalleFasesCate',
            sql: 'UPDATE "public"."ppto_DetalleFasesCate" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
          {
            description: 'copy mapped ids to ppto_Principal',
            sql: 'UPDATE "public"."ppto_Principal" h SET id_centro_costo = c.id FROM "public"."CentroCostos" c WHERE h."CodCentroCto" IS NOT NULL AND c.cod_centro_cto = h."CodCentroCto"',
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify every mapped code was backfilled in almacenMovimientos',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."almacenMovimientos" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in cajaEgresosRetail',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."cajaEgresosRetail" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in cajaIngresos',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."cajaIngresos" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in contrataciones_PPTOMeta',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."contrataciones_PPTOMeta" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in docCompra',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."docCompra" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in docCompraDetalle',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."docCompraDetalle" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in docVenta',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."docVenta" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in docVentaDetalle',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."docVentaDetalle" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in egresos_AnticiposOC',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."egresos_AnticiposOC" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in ordenCompra',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."ordenCompra" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in ppto_DetalleFases',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."ppto_DetalleFases" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in ppto_DetalleFasesCate',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."ppto_DetalleFasesCate" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
          {
            description: 'verify every mapped code was backfilled in ppto_Principal',
            sql: 'SELECT NOT EXISTS (SELECT 1 AS "one" FROM "public"."ppto_Principal" h JOIN "public"."CentroCostos" c ON c.cod_centro_cto = h."CodCentroCto" WHERE h."CodCentroCto" IS NOT NULL AND h.id_centro_costo IS NULL) AS "result"',
            params: [],
          },
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'almacenMovimientos',
        index: 'almacenMovimientos_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cajaEgresosRetail',
        index: 'cajaEgresosRetail_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'cajaIngresos',
        index: 'cajaIngresos_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'contrataciones_PPTOMeta',
        index: 'contrataciones_PPTOMeta_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'docCompra',
        index: 'docCompra_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'docCompraDetalle',
        index: 'docCompraDetalle_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'docVenta',
        index: 'docVenta_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'docVentaDetalle',
        index: 'docVentaDetalle_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'egresos_AnticiposOC',
        index: 'egresos_AnticiposOC_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ordenCompra',
        index: 'ordenCompra_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleFases',
        index: 'ppto_DetalleFases_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        index: 'ppto_DetalleFasesCate_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Principal',
        index: 'ppto_Principal_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'almacenMovimientos',
        foreignKey: {
          name: 'almacenMovimientos_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cajaEgresosRetail',
        foreignKey: {
          name: 'cajaEgresosRetail_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'cajaIngresos',
        foreignKey: {
          name: 'cajaIngresos_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'contrataciones_PPTOMeta',
        foreignKey: {
          name: 'contrataciones_PPTOMeta_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'docCompra',
        foreignKey: {
          name: 'docCompra_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'docCompraDetalle',
        foreignKey: {
          name: 'docCompraDetalle_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'docVenta',
        foreignKey: {
          name: 'docVenta_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'docVentaDetalle',
        foreignKey: {
          name: 'docVentaDetalle_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'egresos_AnticiposOC',
        foreignKey: {
          name: 'egresos_AnticiposOC_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ordenCompra',
        foreignKey: {
          name: 'ordenCompra_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleFases',
        foreignKey: {
          name: 'ppto_DetalleFases_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        foreignKey: {
          name: 'ppto_DetalleFasesCate_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Principal',
        foreignKey: {
          name: 'ppto_Principal_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
