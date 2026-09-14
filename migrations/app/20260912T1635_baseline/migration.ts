#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/9c1d3ea755b10b5d3b6f7feec5df729d2ee951b95d76edd4bf3c41f4be9fa08a/contract';
import endContract from '../../snapshots/9c1d3ea755b10b5d3b6f7feec5df729d2ee951b95d76edd4bf3c41f4be9fa08a/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'CentroCostos',
        columns: [
          col('CentroCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCliente', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Estado', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('FechaFinProg', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FechaFinReal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FechaIncio', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPeriodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('OCFile', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('PresupuestoCostoDirecto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoEstado', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('PresupuestoGastosGenerales', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoMonto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoViaticos', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacenMovimientoDetalle',
        columns: [
          col('Cantidad', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('CodMovimiento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodMovimientoDetalle', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comportamiento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('ProductoCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacenMovimientos',
        columns: [
          col('CodAlmacen', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodMovimiento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodTipoMov', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comportamiento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Fecha', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('TipoCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacenTipoMovimiento',
        columns: [
          col('CodTipoMov', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comportamiento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoMovimiento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'almacenes',
        columns: [
          col('Almacen', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodAlmacen', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'anexo_Especialidad',
        columns: [
          col('Anexo Especialidad', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'anexo_TipoDocIDE',
        columns: [
          col('Anexo_Documento_IDE', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'anexos',
        columns: [
          col('Anexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('AnexoEspecialidadId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('AnexoTipoDocIdeId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('Contacto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Correo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Direccion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('NombreComercial', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('NumeroDocIde', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Telefono', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('tipoAnexo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'anexos_tipoAnexo_check_6ec6fe70',
            "\"tipoAnexo\" IN ('Proveedor', 'Cliente', 'Trabajador')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'bancos',
        columns: [
          col('Banco', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdBanco', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'cajaEgresosRetail',
        columns: [
          col('Ajuste', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoTerminado', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodDocSunat', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodMotivo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Concepto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('DocSunat', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Fecha', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('IdCtaCajaBanco', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMov', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFase', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFaseCategoria', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MedioPago', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MonedaId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto Total', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('NumOperacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TotalPagoDocumentos', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('TotalSinDocumento', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('VoucherDeposito', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'cajaIngresos',
        columns: [
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodMotivo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Concepto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('Fecha', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('IdCtaCajaBanco', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMov', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MedioPago', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto Total', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('NumOperacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TotalPagoDocumentos', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('TotalSinDocumento', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('VoucherDeposito', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'cajaIngresos_DocVenta',
        columns: [
          col('CodDocSunat', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdDocVenta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMov', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMovDocVenta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MontoPagado', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('NumDocumento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'cajaMotivos',
        columns: [
          col('CodMotivo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comportamiento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Motivo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Resultado', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoMotivo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'categoria',
        columns: [
          col('codigo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('descripcion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_tipo_categoria', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'categorias',
        columns: [
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Descripcion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Estado', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('TIPOCATE', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'contrataciones',
        columns: [
          col('Categoria', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CentroCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCliente', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodProveedor', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Codcontratacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Concepto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('ContratoPDF', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('DsctoFacturacion', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('DsctoIntervencion', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('DsctoPersonalCasa', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('DsctoPostVenta', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('EstadoObra', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('IdPeriodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('LiquidacionPDF', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MaterialesManual', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Numero', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('PptoMetaTotal', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoFile', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('PresupuestoIGV', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoMonto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoTotal', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Proveedor', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TIPOCATE', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoContratacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'contrataciones_PPTOMeta',
        columns: [
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodProveedor', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Codcontratacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Codcontratacionpptometa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Concepto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('Fecha', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('File', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'contrataciones_PostVenta',
        columns: [
          col('CentroCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodProveedor', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Codcontratacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodcontratacionPostVenta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Concepto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('Fecha', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('File', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Proveedor', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'cuentasCajaBancos',
        columns: [
          col('CCICuenta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Descripcion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FechaSaldoInicial', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('IdBanco', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdCtaCajaBanco', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMoneda', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('NroCuenta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('SaldoInicial', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Tipo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'docCompra',
        columns: [
          col('Ajuste', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodDocSunat', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Codcontratacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexoDscto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comentarios', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('FechaCrecion', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FechaEmision', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FechaVencimiento', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FormaPago', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IGV', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('IdDocCompra', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdUsuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFase', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFaseCategoria', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Mes', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MonedaId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('NumDocumento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('PDF_Documento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Periodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TC', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('TipoCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Total', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Usuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'docCompraDetalle',
        columns: [
          col('Cantidad', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Codcontratacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexoDscto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdDocCompra', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdDocCompraDetalle', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MonedaId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Precio', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('ProductoCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoProducto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'docCompraDetalle_TipoProducto_check_2fa7d18d',
            "\"TipoProducto\" IN ('PRODUCTO', 'SERVICIO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'docCompra_AplicacionAnticipo',
        columns: [
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdDocCompra', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdDocCompraAplicacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MontoPagado', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('TipoOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'docVenta',
        columns: [
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodDocSunat', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comentarios', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('FechaCrecion', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FechaEmision', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FechaVencimiento', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FormaPago', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IGV', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('IdDocVenta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Mes', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MonedaId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('NumDocumento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('PDF_Documento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Periodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Total', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Usuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'docVentaDetalle',
        columns: [
          col('Cantidad', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdDocVenta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdDocVentaDetalle', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Precio', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('ProductoCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoProducto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'docVentaDetalle_TipoProducto_check_2fa7d18d',
            "\"TipoProducto\" IN ('PRODUCTO', 'SERVICIO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'egresos_AnticiposOC',
        columns: [
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FechaPago', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('IdMov', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMovOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MontoPagado', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('NumeroOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('NumeroOperacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'egresos_DocCompra',
        columns: [
          col('CodDocSunat', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdDocCompra', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMov', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMovDocCompra', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto Pagado', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('NumDocumento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'egresos_Otros',
        columns: [
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodMotivo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Fecha', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('IdMov', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdMovOtros', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MedioPago', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto Total', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('TipoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'empresas',
        columns: [
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CorreoCompras', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('DireccionEntrega', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('DomicilioFiscal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('RUC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('RazonSocial', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'incidencia',
        columns: [
          col('accionPrevia', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('accionTomada', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('aprobacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('cargoRegistrador', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('cuadra', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('direccionExacta', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('docRegistrador', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('docSolicitante', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('documentoGestrad', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('domicilioSolicitante', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('estado', 'character varying(50)', {
            notNull: true,
            default: lit('PENDIENTE'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('fechaCreacion', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('fechaFin', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('fechaIncidencia', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('fechaInicio', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('gerenciaAsignada', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('horaIncidencia', 'character varying(10)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('incidencia', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('latitud', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('longitud', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('origenIncidencia', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('prioridadCategoria', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('promotor', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('representante', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('sectorVecinal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('solicitante', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('telefonoSolicitante', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('tipificacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('urbanizacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('viaOrigen', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'menu',
        columns: [
          col('Imagen', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MenuId', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MenuNombre', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [primaryKey(['MenuId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'monedas',
        columns: [
          col('Moneda', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MonedaId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Simbolo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ordenCompra',
        columns: [
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comentarios', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('Cotizacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('DsctoCompras', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('DsctoIntervencion', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('DsctoOtros', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('FechaCreacion', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FechaEmision', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FormaPago', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('HoraCreacion', 'character varying(10)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 10 } },
          }),
          col('IGV', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('IdOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Mes', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MonedaId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MonedaSimbolo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('NumeroOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('OCPDF', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Periodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Renta4ta', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('TipoCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Total', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Usuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ordenCompraDetalle',
        columns: [
          col('Cantidad', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('IdOC', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdOCDetalle', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Precio', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('ProductoCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoProducto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('monto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ordenCompraDetalle_TipoProducto_check_2fa7d18d',
            "\"TipoProducto\" IN ('PRODUCTO', 'SERVICIO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'periodos',
        columns: [
          col('IdPeriodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'planillaPago',
        columns: [
          col('Categoria', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CentroCosto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCliente', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodProveedor', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodSemana', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Codcontratacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodcontratacionDetalle', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('DsctoCompras', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('DsctoIntervencion', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('DsctoPostVenta', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Estado', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('FechaFinal', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FechaInicio', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('IdPeriodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MontoSemana', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Numero', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('PlanillaIGV', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PlanillaMonto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PlanillaTotal', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoSaldoIGV', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoSaldoMonto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('PresupuestoSaldoTotal', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Proveedor', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Semana', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoContratacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_DetalleFases',
        columns: [
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CostoDirecto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('FechaCreacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuestoDetalle', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFase', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Usuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        columns: [
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CostoDirecto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('FechaCreacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuestoDetalle', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuestoDetalleCategoria', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFase', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFaseCategoria', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Usuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_Fases',
        columns: [
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FaseProyecto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFase', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_FasesCategorias',
        columns: [
          col('Descripcion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFase', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdpptoFaseCategoria', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_Principal',
        columns: [
          col('CodCentroCto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodCentroCtoPrincipal', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodEmpresa', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('CodigoAnexo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comentarios', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('Concepto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('CostoDirecto', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('DsctoComercial', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Estado', 'character varying(50)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 50 } },
          }),
          col('FILE_Presupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FechaCreacion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FechaEntrega', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FechaRequerimiento', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('File', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('GGPorcentaje', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('GastosGenerales', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('IGV', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('IdPeriodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdUsuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Proyecto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('SubTotalSinIGV', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('TipoPpto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Total', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Usuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('UtiliPorcentaje', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Utilidad', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('Version', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Viaticos', 'numeric', { codecRef: { codecId: 'pg/numeric@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ppto_Principal_Historial',
        columns: [
          col('FileCorreo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FilePpto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuesto', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdPresupuestoVersion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('NumVersion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'producto',
        columns: [
          col('codigo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('comentarios', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('descripcion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_categoria', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_unidad_medida', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('imagen_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('stock', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('tipo_producto', 'text', {
            notNull: true,
            default: lit('PRODUCTO'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'producto_tipo_producto_check_45026309',
            "\"tipo_producto\" IN ('PRODUCTO', 'SERVICIO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'productos',
        columns: [
          col('CategoriaCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Comentarios', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('Descripcion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('Imagen', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('ProductoCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoProducto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('UniMedCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'productos_TipoProducto_check_2fa7d18d',
            "\"TipoProducto\" IN ('PRODUCTO', 'SERVICIO')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'semana',
        columns: [
          col('CodSemana', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('FechaFinal', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('FechaInicio', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('IdPeriodo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Semana', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'subMenu',
        columns: [
          col('Imagen', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MenuId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('SubMenuNombre', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('SubMenuVista', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('TipoSubMenu', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'tipoDocumentoSunat',
        columns: [
          col('CodDocSunat', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('DocumentoSunat', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'tipo_categoria',
        columns: [
          col('codigo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nombre', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'unidadMedida',
        columns: [
          col('Descripcion', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Simbolo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('UniMedCodigo', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'unidad_medida',
        columns: [
          col('codigo', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('descripcion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('simbolo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        columns: [
          col('estado', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('factor_conversion', 'numeric', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_uni_med_destino', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_uni_med_origen', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'usuarios',
        columns: [
          col('Clave', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdUsuario', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Nombres', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Rol', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('Usuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [primaryKey(['IdUsuario'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'usuariosMenus',
        columns: [
          col('IdUsuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdUsuarioMenu', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MenuId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'usuariosPermisos',
        columns: [
          col('IdUsuario', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('IdUsuarioPermiso', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('MenuId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('SubMenuId', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
        ],
        constraints: [primaryKey(['IdUsuarioPermiso'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'CentroCostos',
        constraint: 'CentroCostos_CodCentroCto_key',
        columns: ['CodCentroCto'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'categoria',
        constraint: 'categoria_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_DetalleFases',
        constraint: 'ppto_DetalleFases_IdPresupuestoDetalle_key',
        columns: ['IdPresupuestoDetalle'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_DetalleFasesCate',
        constraint: 'ppto_DetalleFasesCate_IdPresupuestoDetalleCategoria_key',
        columns: ['IdPresupuestoDetalleCategoria'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_Fases',
        constraint: 'ppto_Fases_IdpptoFase_key',
        columns: ['IdpptoFase'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_FasesCategorias',
        constraint: 'ppto_FasesCategorias_IdpptoFaseCategoria_key',
        columns: ['IdpptoFaseCategoria'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ppto_Principal',
        constraint: 'ppto_Principal_IdPresupuesto_key',
        columns: ['IdPresupuesto'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'producto',
        constraint: 'producto_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'tipo_categoria',
        constraint: 'tipo_categoria_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'unidad_medida',
        constraint: 'unidad_medida_codigo_key',
        columns: ['codigo'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        constraint: 'unidad_medida_equivalencia_id_uni_med_origen_id_uni_med_destino_key',
        columns: ['id_uni_med_origen', 'id_uni_med_destino'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'anexos',
        index: 'anexos_AnexoEspecialidadId_idx_343e8198',
        columns: ['AnexoEspecialidadId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'anexos',
        index: 'anexos_AnexoTipoDocIdeId_idx_85b59811',
        columns: ['AnexoTipoDocIdeId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'categoria',
        index: 'categoria_id_tipo_categoria_idx_ac61ceef',
        columns: ['id_tipo_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto',
        index: 'producto_id_categoria_idx_dc879264',
        columns: ['id_categoria'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'producto',
        index: 'producto_id_unidad_medida_idx_e475ad90',
        columns: ['id_unidad_medida'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        index: 'unidad_medida_equivalencia_id_uni_med_destino_idx_2e03e6bc',
        columns: ['id_uni_med_destino'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        index: 'unidad_medida_equivalencia_id_uni_med_origen_idx_78ff0333',
        columns: ['id_uni_med_origen'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'anexos',
        foreignKey: {
          name: 'anexos_AnexoEspecialidadId_fkey',
          columns: ['AnexoEspecialidadId'],
          references: { schema: 'public', table: 'anexo_Especialidad', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'anexos',
        foreignKey: {
          name: 'anexos_AnexoTipoDocIdeId_fkey',
          columns: ['AnexoTipoDocIdeId'],
          references: { schema: 'public', table: 'anexo_TipoDocIDE', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'categoria',
        foreignKey: {
          name: 'categoria_id_tipo_categoria_fkey',
          columns: ['id_tipo_categoria'],
          references: { schema: 'public', table: 'tipo_categoria', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto',
        foreignKey: {
          name: 'producto_id_categoria_fkey',
          columns: ['id_categoria'],
          references: { schema: 'public', table: 'categoria', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'producto',
        foreignKey: {
          name: 'producto_id_unidad_medida_fkey',
          columns: ['id_unidad_medida'],
          references: { schema: 'public', table: 'unidad_medida', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        foreignKey: {
          name: 'unidad_medida_equivalencia_id_uni_med_origen_fkey',
          columns: ['id_uni_med_origen'],
          references: { schema: 'public', table: 'unidad_medida', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'unidad_medida_equivalencia',
        foreignKey: {
          name: 'unidad_medida_equivalencia_id_uni_med_destino_fkey',
          columns: ['id_uni_med_destino'],
          references: { schema: 'public', table: 'unidad_medida', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
