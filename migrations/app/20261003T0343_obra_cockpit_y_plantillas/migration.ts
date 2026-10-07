#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5fc1b590cac19c142654917944bd45645187947d0375edbb66e1ed420c0e1e68/contract';
import startContract from '../../snapshots/5fc1b590cac19c142654917944bd45645187947d0375edbb66e1ed420c0e1e68/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/c4735e322dbddefb763dde8f44c473bcee4472c75c5e3f1c7dfdac941f75f58d/contract';
import endContract from '../../snapshots/c4735e322dbddefb763dde8f44c473bcee4472c75c5e3f1c7dfdac941f75f58d/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'obra_datos_generales',
        columns: [
          col('contacto_cliente_correo', 'character varying(150)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('contacto_cliente_nombre', 'character varying(150)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('contacto_cliente_telefono', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('created_at', 'timestamptz', {
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('departamento', 'character varying(100)', {
            default: lit('Lima'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('direccion', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('distrito', 'character varying(100)', {
            default: lit('Lima'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('expediente_codigo', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('latitud', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('longitud', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('personal_activo_promedio', 'int4', {
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('provincia', 'character varying(100)', {
            default: lit('Lima'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('semanas_totales', 'int4', { default: lit(6), codecRef: { codecId: 'pg/int4@1' } }),
          col('turno_trabajo', 'character varying(50)', {
            default: lit('Diurno'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('ubigeo_cod', 'character varying(10)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('updated_at', 'timestamptz', {
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_documentos_actas',
        columns: [
          col('archivo_url', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('categoria', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('created_at', 'timestamptz', {
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('estado', 'character varying(50)', {
            default: lit('Validado'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('fecha_emision', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nro_registro', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('subtitulo', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('titulo', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('vigencia_texto', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_incidencias_rfi',
        columns: [
          col('accion_solicitada_o_ejecutada', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('codigo_incidencia', 'character varying(50)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('descripcion', 'character varying(1000)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('estado', 'character varying(50)', {
            default: lit('PENDIENTE'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('fecha_reporte', 'timestamptz', {
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fecha_resolucion', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('plazo_resolucion', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('prioridad', 'character varying(50)', {
            default: lit('MEDIA'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('responsable', 'character varying(150)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('titulo', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_planos',
        columns: [
          col('archivo_url', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('codigo_plano', 'character varying(50)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('created_at', 'timestamptz', {
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('disciplina', 'character varying(50)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('emitido_por', 'character varying(150)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('es_vigente', 'bool', { default: lit(true), codecRef: { codecId: 'pg/bool@1' } }),
          col('estado_aprobacion', 'character varying(50)', {
            default: lit('Aprobado Obra'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('fecha_vobo', 'date', { codecRef: { codecId: 'pg/date-string@1' } }),
          col('formato_peso', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_plano_anterior', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre_plano', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('version', 'character varying(20)', {
            default: lit('v1.0'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 20 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_residentes',
        columns: [
          col('cip_cap', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('correo', 'character varying(150)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('created_at', 'timestamptz', {
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('especialidad', 'character varying(150)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
          col('estado_planta', 'character varying(50)', {
            default: lit('En Planta'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('foto_url', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_anexo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre_completo', 'character varying(200)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 200 } },
          }),
          col('orden', 'int4', { default: lit(0), codecRef: { codecId: 'pg/int4@1' } }),
          col('rol_obra', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('telefono', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('turno', 'character varying(100)', {
            default: lit('Lun - Sáb 07:00 - 18:00'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'obra_semanas_cronograma',
        columns: [
          col('descripcion_actividades', 'character varying(1000)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1000 } },
          }),
          col('estado', 'character varying(50)', {
            default: lit('Programado'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('etiqueta_semana', 'character varying(50)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('fase_principal', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('fecha_fin', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('fecha_inicio', 'date', { notNull: true, codecRef: { codecId: 'pg/date-string@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_centro_costo', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('numero_semana', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('orden', 'int4', { default: lit(0), codecRef: { codecId: 'pg/int4@1' } }),
          col('porcentaje_meta', 'numeric', {
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('porcentaje_real', 'numeric', {
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('responsable_nombre', 'character varying(150)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 150 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_Plantillas',
        columns: [
          col('Activo', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('Descripcion', 'character varying(500)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
          }),
          col('FechaCreacion', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('IdPlantilla', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Nombre', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_Plantillas_Categorias',
        columns: [
          col('CostoReferencial', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('IdPlantillaFase', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFaseCategoria', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_Plantillas_Fases',
        columns: [
          col('IdPlantilla', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPlantillaFase', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFase', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Orden', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'CentroCostos',
        column: col('id_anexo', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'CentroCostos',
        column: col('id_empresa', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'obra_datos_generales',
        constraint: 'obra_datos_generales_id_centro_costo_key',
        columns: ['id_centro_costo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'obra_semanas_cronograma',
        constraint: 'obra_semanas_cronograma_id_centro_costo_numero_semana_key',
        columns: ['id_centro_costo', 'numero_semana'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_Plantillas',
        constraint: 'ppto_Plantillas_IdPlantilla_key',
        columns: ['IdPlantilla'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_Plantillas_Fases',
        constraint: 'ppto_Plantillas_Fases_IdPlantillaFase_key',
        columns: ['IdPlantillaFase'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CentroCostos',
        index: 'CentroCostos_id_anexo_idx_726d2e48',
        columns: ['id_anexo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'CentroCostos',
        index: 'CentroCostos_id_empresa_idx_328936e2',
        columns: ['id_empresa'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_documentos_actas',
        index: 'obra_documentos_actas_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_incidencias_rfi',
        index: 'obra_incidencias_rfi_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_planos',
        index: 'obra_planos_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_residentes',
        index: 'obra_residentes_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'obra_semanas_cronograma',
        index: 'obra_semanas_cronograma_id_centro_costo_idx_8c84570b',
        columns: ['id_centro_costo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Plantillas_Categorias',
        index: 'ppto_Plantillas_Categorias_IdPlantillaFase_idx_59e4a696',
        columns: ['IdPlantillaFase'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ppto_Plantillas_Fases',
        index: 'ppto_Plantillas_Fases_IdPlantilla_idx_ca8fcfac',
        columns: ['IdPlantilla'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CentroCostos',
        foreignKey: {
          name: 'CentroCostos_id_anexo_fkey',
          columns: ['id_anexo'],
          references: { schema: 'public', table: 'anexos', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'CentroCostos',
        foreignKey: {
          name: 'CentroCostos_id_empresa_fkey',
          columns: ['id_empresa'],
          references: { schema: 'public', table: 'empresas', columns: ['id_empresa'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_datos_generales',
        foreignKey: {
          name: 'obra_datos_generales_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_documentos_actas',
        foreignKey: {
          name: 'obra_documentos_actas_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_incidencias_rfi',
        foreignKey: {
          name: 'obra_incidencias_rfi_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_planos',
        foreignKey: {
          name: 'obra_planos_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_residentes',
        foreignKey: {
          name: 'obra_residentes_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'obra_semanas_cronograma',
        foreignKey: {
          name: 'obra_semanas_cronograma_id_centro_costo_fkey',
          columns: ['id_centro_costo'],
          references: { schema: 'public', table: 'CentroCostos', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Plantillas_Categorias',
        foreignKey: {
          name: 'ppto_Plantillas_Categorias_IdPlantillaFase_fkey',
          columns: ['IdPlantillaFase'],
          references: {
            schema: 'public',
            table: 'ppto_Plantillas_Fases',
            columns: ['IdPlantillaFase'],
          },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ppto_Plantillas_Fases',
        foreignKey: {
          name: 'ppto_Plantillas_Fases_IdPlantilla_fkey',
          columns: ['IdPlantilla'],
          references: { schema: 'public', table: 'ppto_Plantillas', columns: ['IdPlantilla'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
