import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { validarTrabajador } from '../../requerimientos/shared/requerimiento-eventos.js';
import { bloquearYConsultar, type DocumentoConsultado } from '../shared/documentos-consulta.js';
import { claveMoneda, tcVigente } from '../shared/tipo-cambio.js';
import { esSoles, esViernes, redondear } from '../shared/tributos.js';
import {
  AnularPagoDto,
  EjecutarPagoDto,
  ListPagosQueryDto,
  MEDIOS_CON_OPERACION,
  PagoDirectoDto,
} from '../tesoreria.dto.js';
import { saldoProgramable } from '../programacion/programacion.handler.js';

const EPS = 0.005;

export interface PagoDetalle {
  id: number;
  numero: string;
  id_documento_origen: number;
  numero_documento: string | null;
  clase_documento: string | null;
  numero_requerimiento: string | null;
  proveedor: string | null;
  ruc: string | null;
  centro_costo: string | null;
  moneda_id: string | null;
  moneda_simbolo: string | null;
  concepto: string;
  fecha_pago: string;
  monto: string;
  moneda_cuenta: string;
  tipo_cambio: string | null;
  monto_cuenta: string;
  medio_pago: string;
  id_cuenta: number;
  cuenta: string | null;
  banco: string | null;
  numero_cuenta: string | null;
  cuenta_destino: string | null;
  numero_operacion: string | null;
  ejecutado_por: string | null;
  estado: string;
  observaciones: string | null;
  created_at: string;
}

const PAGO_SPEC = {
  id: I,
  numero: T,
  id_documento_origen: I,
  numero_documento: TN,
  clase_documento: TN,
  numero_requerimiento: TN,
  proveedor: TN,
  ruc: TN,
  centro_costo: TN,
  moneda_id: TN,
  moneda_simbolo: TN,
  concepto: T,
  fecha_pago: T,
  monto: T,
  moneda_cuenta: T,
  tipo_cambio: TN,
  monto_cuenta: T,
  medio_pago: T,
  id_cuenta: I,
  cuenta: TN,
  banco: TN,
  numero_cuenta: TN,
  cuenta_destino: TN,
  numero_operacion: TN,
  ejecutado_por: TN,
  estado: T,
  observaciones: TN,
  created_at: T,
  total_filas: I,
} as const;

@Injectable()
export class PagosHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(query: ListPagosQueryDto): Promise<Paginated<PagoDetalle>> {
    const { page, pageSize, offset } = pageParams(query);
    const { rows, total } = await this.consultar({ ...query }, pageSize, offset);
    return toPaginated(rows, total, page, pageSize);
  }

  /** Datos del comprobante de pago. */
  async getById(id: number): Promise<PagoDetalle> {
    const { rows } = await this.consultar({ id }, 1, 0);
    if (!rows[0]) throw new NotFoundException(`Pago ${id} no encontrado`);
    return rows[0];
  }

  // -------------------------------------------------------------- escritura

  async ejecutar(dto: EjecutarPagoDto): Promise<PagoDetalle> {
    const id = await this.db.transaction((tx) => this.ejecutarEnTx(tx, dto));
    return this.getById(id);
  }

  /** "Pagar ahora": crea la programacion (urgente si no es viernes) y el pago en la misma transaccion. */
  async pagarDirecto(dto: PagoDirectoDto): Promise<PagoDetalle> {
    const id = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const concepto = dto.concepto ?? 'PROVEEDOR';
      const doc = await this.bloquearDocumento(tx, dto.id_documento_origen);
      if (concepto === 'DETRACCION' && Number(doc.detraccion_monto ?? 0) <= 0) {
        throw new BadRequestException(`El documento ${doc.numero_documento ?? doc.id} no tiene detracción`);
      }
      if (Number(dto.monto) <= 0) throw new BadRequestException('El monto debe ser mayor a 0');
      const disponible = saldoProgramable(doc, concepto);
      if (Number(dto.monto) > disponible + EPS) {
        throw new BadRequestException(
          `El monto (${dto.monto}) supera el saldo por pagar (${redondear(Math.max(disponible, 0)).toFixed(2)}) de ${concepto}`,
        );
      }
      const urgente = !esViernes(dto.fecha_pago);
      const [prog] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO pago_programado (id_documento_origen, concepto, fecha_programada, urgente, monto, medio_pago, id_cuenta,
                                     cuenta_destino, id_programado_por, observaciones)
        VALUES (${dto.id_documento_origen}::int, ${concepto}::text, ${dto.fecha_pago}::date, ${urgente}::boolean, ${dto.monto}::numeric,
                ${dto.medio_pago}::text, ${dto.id_cuenta}::int, NULLIF(${dto.cuenta_destino ?? ''}::text, ''),
                NULLIF(${dto.id_ejecutado_por ?? 0}::int, 0), 'Pago directo')
        RETURNING id`;
      return this.ejecutarEnTx(tx, {
        id_pago_programado: prog.id,
        fecha_pago: dto.fecha_pago,
        monto: dto.monto,
        id_cuenta: dto.id_cuenta,
        medio_pago: dto.medio_pago,
        numero_operacion: dto.numero_operacion,
        tipo_cambio: dto.tipo_cambio,
        id_ejecutado_por: dto.id_ejecutado_por,
        observaciones: dto.observaciones,
      });
    });
    return this.getById(id);
  }

  /** Anula el pago: el monto vuelve a estar programado y el saldo se libera. */
  async anular(id: number, dto: AnularPagoDto): Promise<PagoDetalle> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [pago] = await q.rows<{ estado: string; id_documento_origen: number; id_pago_programado: number | null }>(
        { estado: T, id_documento_origen: I, id_pago_programado: IN },
        tx,
      )`
        SELECT estado::text AS estado, id_documento_origen, id_pago_programado FROM pago WHERE id = ${id}::int FOR UPDATE`;
      if (!pago) throw new NotFoundException(`Pago ${id} no encontrado`);
      if (pago.estado !== 'REGISTRADO') throw new ConflictException(`El pago ya está ${pago.estado}`);
      await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "documentosOrigen" WHERE id = ${pago.id_documento_origen}::int FOR UPDATE`;

      await q.run(tx)`
        UPDATE pago SET estado = 'ANULADO',
               observaciones = CASE WHEN ${(dto.motivo ?? '') !== ''}::boolean
                                    THEN COALESCE(observaciones || E'\n', '') || 'ANULADO: ' || ${dto.motivo ?? ''}::text
                                    ELSE observaciones END
         WHERE id = ${id}::int`;
      if (pago.id_pago_programado !== null) {
        await q.run(tx)`UPDATE pago_programado SET estado = 'PROGRAMADO' WHERE id = ${pago.id_pago_programado}::int`;
      }
    });
    return this.getById(id);
  }

  // ---------------------------------------------------------------- privado

  /** Ejecuta una programacion dentro de `tx`; devuelve el id del pago. */
  private async ejecutarEnTx(tx: Tx, dto: EjecutarPagoDto): Promise<number> {
    const q = sqlTag(this.sql);
    const [prog] = await q.rows<{
      id_documento_origen: number;
      concepto: string;
      estado: string;
      monto: string;
      medio_pago: string;
      fecha: string;
      urgente: boolean;
      cuenta_destino: string | null;
      id_programado_por: number | null;
      observaciones: string | null;
      id_cuenta: number | null;
    }>(
      {
        id_documento_origen: I, concepto: T, estado: T, monto: T, medio_pago: T, fecha: T, urgente: B,
        cuenta_destino: TN, id_programado_por: IN, observaciones: TN, id_cuenta: IN,
      },
      tx,
    )`
      SELECT id_documento_origen, concepto::text AS concepto, estado::text AS estado, monto::text AS monto, medio_pago::text AS medio_pago,
             fecha_programada::text AS fecha, urgente, cuenta_destino::text AS cuenta_destino, id_programado_por, observaciones, id_cuenta
        FROM pago_programado WHERE id = ${dto.id_pago_programado}::int FOR UPDATE`;
    if (!prog) throw new NotFoundException(`Programacion ${dto.id_pago_programado} no encontrada`);
    if (prog.estado !== 'PROGRAMADO') throw new ConflictException(`La programación está ${prog.estado}; solo se ejecuta una PROGRAMADO`);

    const doc = await this.bloquearDocumento(tx, prog.id_documento_origen);
    const monto = dto.monto ?? prog.monto;
    if (Number(monto) <= 0) throw new BadRequestException('El monto debe ser mayor a 0');
    if (Number(monto) > Number(prog.monto) + EPS) {
      throw new BadRequestException(`El monto (${monto}) supera lo programado (${prog.monto})`);
    }
    const limite = prog.concepto === 'DETRACCION' ? Number(doc.detraccion_monto ?? 0) : Number(doc.neto_proveedor);
    const pagado = prog.concepto === 'DETRACCION' ? Number(doc.pagado_detraccion) : Number(doc.pagado_proveedor);
    if (pagado + Number(monto) > limite + EPS) {
      throw new BadRequestException(`El pago supera el saldo por pagar (${redondear(Math.max(limite - pagado, 0)).toFixed(2)})`);
    }
    if (dto.id_ejecutado_por !== undefined) await validarTrabajador(this.sql, tx, dto.id_ejecutado_por, 'id_ejecutado_por');

    const [cuenta] = await q.rows<{ moneda_id: string; estado: boolean }>({ moneda_id: T, estado: B }, tx)`
      SELECT moneda_id::text AS moneda_id, estado FROM cuenta_tesoreria WHERE id = ${dto.id_cuenta}::int`;
    if (!cuenta) throw new BadRequestException(`Cuenta ${dto.id_cuenta} no existe`);
    if (!cuenta.estado) throw new BadRequestException(`La cuenta ${dto.id_cuenta} está inactiva`);

    const medio = dto.medio_pago ?? prog.medio_pago;
    if (MEDIOS_CON_OPERACION.includes(medio) && (dto.numero_operacion ?? '').trim() === '') {
      throw new BadRequestException(`El medio ${medio} exige el número de operación, cheque o constancia`);
    }

    // Moneda del importe: la detraccion siempre es en soles; el resto, la del documento.
    const monedaImporte =
      prog.concepto === 'DETRACCION' || esSoles(doc.moneda_id, doc.moneda_simbolo) ? 'PEN' : claveMoneda(doc.moneda_id, doc.moneda_simbolo);
    // La cuenta se identifica por su moneda_id (no por simbolo: un simbolo vacio no significa soles).
    const monedaCuenta = ['PEN', 'S/', 'SOLES'].includes(cuenta.moneda_id.toUpperCase()) ? 'PEN' : claveMoneda(cuenta.moneda_id);
    let tipoCambio: string | null = null;
    let montoCuenta = Number(monto);
    if (monedaImporte !== monedaCuenta) {
      if (monedaImporte !== 'PEN' && monedaCuenta !== 'PEN') {
        throw new BadRequestException(`No se puede pagar un documento en ${monedaImporte} desde una cuenta en ${monedaCuenta}`);
      }
      const extranjera = monedaImporte === 'PEN' ? monedaCuenta : monedaImporte;
      tipoCambio = dto.tipo_cambio ?? (await tcVigente(this.sql, extranjera, dto.fecha_pago, tx))?.venta ?? null;
      if (tipoCambio === null) {
        throw new BadRequestException(`Registre el tipo de cambio de ${extranjera} (tesoreria/tipo-cambio) o indíquelo en el pago`);
      }
      montoCuenta = monedaImporte === 'PEN' ? Number(monto) / Number(tipoCambio) : Number(monto) * Number(tipoCambio);
    }

    const numero = await this.ledger.siguienteNumero(tx, 'CP');
    const [pago] = await q.rows<{ id: number }>({ id: I }, tx)`
      INSERT INTO pago (numero, id_documento_origen, concepto, id_pago_programado, fecha_pago, monto, moneda_cuenta, tipo_cambio,
                        monto_cuenta, medio_pago, id_cuenta, numero_operacion, id_ejecutado_por, observaciones)
      VALUES (${numero}::text, ${prog.id_documento_origen}::int, ${prog.concepto}::text, ${dto.id_pago_programado}::int,
              ${dto.fecha_pago}::date, ${monto}::numeric, ${monedaCuenta}::text,
              CASE WHEN ${tipoCambio !== null}::boolean THEN ${tipoCambio ?? '0'}::numeric END,
              ${redondear(montoCuenta).toFixed(2)}::numeric, ${medio}::text, ${dto.id_cuenta}::int,
              NULLIF(${dto.numero_operacion ?? ''}::text, ''), NULLIF(${dto.id_ejecutado_por ?? 0}::int, 0),
              NULLIF(${dto.observaciones ?? ''}::text, ''))
      RETURNING id`;

    if (Number(monto) < Number(prog.monto) - EPS) {
      // Pago parcial: la programacion queda por lo pagado y el resto se reprograma para la misma fecha.
      await q.run(tx)`UPDATE pago_programado SET estado = 'EJECUTADO', monto = ${monto}::numeric WHERE id = ${dto.id_pago_programado}::int`;
      const resto = redondear(Number(prog.monto) - Number(monto), 4).toString();
      await q.run(tx)`
        INSERT INTO pago_programado (id_documento_origen, concepto, fecha_programada, urgente, monto, medio_pago, id_cuenta,
                                     cuenta_destino, id_programado_por, observaciones)
        VALUES (${prog.id_documento_origen}::int, ${prog.concepto}::text, ${prog.fecha}::date, ${prog.urgente}::boolean, ${resto}::numeric,
                ${prog.medio_pago}::text, NULLIF(${prog.id_cuenta ?? 0}::int, 0), NULLIF(${prog.cuenta_destino ?? ''}::text, ''),
                NULLIF(${prog.id_programado_por ?? 0}::int, 0), ${'Saldo de un pago parcial de ' + numero}::text)`;
    } else {
      await q.run(tx)`UPDATE pago_programado SET estado = 'EJECUTADO' WHERE id = ${dto.id_pago_programado}::int`;
    }
    return pago.id;
  }

  private async bloquearDocumento(tx: Tx, id: number): Promise<DocumentoConsultado> {
    const doc = await bloquearYConsultar(this.sql, tx, id);
    if (!doc) throw new NotFoundException(`Documento de origen ${id} no encontrado`);
    if (doc.estado !== 'REGISTRADO') throw new ConflictException(`El documento ${doc.numero_documento ?? doc.id} está ${doc.estado}`);
    return doc;
  }

  private async consultar(
    f: { id?: number; desde?: string; hasta?: string; id_documento_origen?: number; id_cuenta?: number; estado?: string },
    limit: number,
    offset: number,
  ): Promise<{ rows: PagoDetalle[]; total: number }> {
    const q = sqlTag(this.sql);
    const id = f.id ?? 0;
    const desde = f.desde ?? '1900-01-01';
    const hasta = f.hasta ?? '9999-12-31';
    const doc = f.id_documento_origen ?? 0;
    const cuenta = f.id_cuenta ?? 0;
    const estado = f.estado ?? '';
    const rows = await q.rows<PagoDetalle & { total_filas: number }>(PAGO_SPEC)`
      SELECT p.id, p.numero::text AS numero, p.id_documento_origen, o.numero_documento::text AS numero_documento,
             o.clase_documento::text AS clase_documento, r.numero::text AS numero_requerimiento,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, a."NumeroDocIde"::text AS ruc,
             cc.centro_costo::text AS centro_costo, o.moneda_id::text AS moneda_id, o.moneda_simbolo::text AS moneda_simbolo,
             p.concepto::text AS concepto, p.fecha_pago::text AS fecha_pago, p.monto::text AS monto, p.moneda_cuenta::text AS moneda_cuenta,
             p.tipo_cambio::text AS tipo_cambio, p.monto_cuenta::text AS monto_cuenta, p.medio_pago::text AS medio_pago, p.id_cuenta,
             c.nombre::text AS cuenta, c.banco::text AS banco, c.numero_cuenta::text AS numero_cuenta,
             g.cuenta_destino::text AS cuenta_destino, p.numero_operacion::text AS numero_operacion,
             COALESCE(ej."NombreComercial", ej."Anexo")::text AS ejecutado_por, p.estado::text AS estado, p.observaciones,
             p.created_at::text AS created_at, (count(*) OVER ())::int AS total_filas
        FROM pago p
        JOIN "documentosOrigen" o ON o.id = p.id_documento_origen
        LEFT JOIN anexos a ON a.id = o.id_anexo
        LEFT JOIN "CentroCostos" cc ON cc.id = o.id_centro_costo
        LEFT JOIN requerimiento r ON r.id = o.id_requerimiento
        LEFT JOIN cuenta_tesoreria c ON c.id = p.id_cuenta
        LEFT JOIN pago_programado g ON g.id = p.id_pago_programado
        LEFT JOIN anexos ej ON ej.id = p.id_ejecutado_por
       WHERE (${id}::int = 0 OR p.id = ${id}::int) AND p.fecha_pago >= ${desde}::date AND p.fecha_pago <= ${hasta}::date
         AND (${doc}::int = 0 OR p.id_documento_origen = ${doc}::int) AND (${cuenta}::int = 0 OR p.id_cuenta = ${cuenta}::int)
         AND (${estado}::text = '' OR p.estado = ${estado}::text)
       ORDER BY p.id DESC LIMIT ${limit}::int OFFSET ${offset}::int`;
    return { rows: rows.map(({ total_filas: _t, ...r }) => r), total: rows[0]?.total_filas ?? 0 };
  }
}
