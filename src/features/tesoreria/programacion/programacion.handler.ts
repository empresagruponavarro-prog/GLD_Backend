import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { bloquearYConsultar, consultarDocumentos, type DocumentoConsultado } from '../shared/documentos-consulta.js';
import { ConversorSoles } from '../shared/conversor-soles.js';
import { esViernes, redondear } from '../shared/tributos.js';
import {
  CreateProgramacionDto,
  ListProgramacionQueryDto,
  PendientesProgramacionQueryDto,
  ProgramacionItemDto,
  UpdateProgramacionDto,
} from '../tesoreria.dto.js';

const EPS = 0.005;

export interface ProgramacionRow {
  id: number;
  id_documento_origen: number;
  numero_documento: string | null;
  clase_documento: string | null;
  proveedor: string | null;
  centro_costo: string | null;
  moneda_id: string | null;
  moneda_simbolo: string | null;
  concepto: string;
  fecha_programada: string;
  urgente: boolean;
  monto: string;
  monto_soles: string;
  medio_pago: string;
  id_cuenta: number | null;
  cuenta: string | null;
  cuenta_destino: string | null;
  estado: string;
  observaciones: string | null;
}

const PROG_SPEC = {
  id: I,
  id_documento_origen: I,
  numero_documento: TN,
  clase_documento: TN,
  proveedor: TN,
  centro_costo: TN,
  moneda_id: TN,
  moneda_simbolo: TN,
  concepto: T,
  fecha_programada: T,
  urgente: B,
  monto: T,
  medio_pago: T,
  id_cuenta: IN,
  cuenta: TN,
  cuenta_destino: TN,
  estado: T,
  observaciones: TN,
} as const;

/** Saldo que todavia se puede programar de un concepto del documento (descontando pagado y programado). */
export function saldoProgramable(doc: DocumentoConsultado, concepto: string, devolver = 0): number {
  if (concepto === 'DETRACCION') {
    return Number(doc.detraccion_monto ?? 0) - Number(doc.pagado_detraccion) - Number(doc.programado_detraccion) + devolver;
  }
  return Number(doc.neto_proveedor) - Number(doc.pagado_proveedor) - Number(doc.programado_proveedor) + devolver;
}

@Injectable()
export class ProgramacionHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
  ) {}

  // ---------------------------------------------------------------- lectura

  /** Documentos vigentes con saldo por programar (proveedor o detraccion). */
  async pendientes(query: PendientesProgramacionQueryDto): Promise<Paginated<Omit<DocumentoConsultado, 'total_filas'>>> {
    const { page, pageSize, offset } = pageParams(query);
    const rows = await consultarDocumentos(
      this.sql,
      { ...query, estado: 'REGISTRADO', con_saldo_por_programar: true },
      pageSize,
      offset,
    );
    return toPaginated(
      rows.map(({ total_filas: _t, ...r }) => r),
      rows[0]?.total_filas ?? 0,
      page,
      pageSize,
    );
  }

  /** Agenda de pagos programados, con totales en soles por fecha. */
  async agenda(query: ListProgramacionQueryDto) {
    const items = await this.listar(query);
    const conv = new ConversorSoles(this.sql);
    for (const it of items) {
      it.monto_soles = redondear(
        it.concepto === 'DETRACCION' ? Number(it.monto) : await conv.aSoles(Number(it.monto), it.moneda_id, it.moneda_simbolo, it.fecha_programada),
      ).toFixed(2);
    }
    const porFecha = new Map<string, { fecha: string; cantidad: number; total_soles: number; por_cuenta: Map<string, number> }>();
    for (const it of items) {
      const f = porFecha.get(it.fecha_programada) ?? { fecha: it.fecha_programada, cantidad: 0, total_soles: 0, por_cuenta: new Map() };
      f.cantidad++;
      f.total_soles += Number(it.monto_soles);
      const cuenta = it.cuenta ?? 'Sin cuenta';
      f.por_cuenta.set(cuenta, (f.por_cuenta.get(cuenta) ?? 0) + Number(it.monto_soles));
      porFecha.set(it.fecha_programada, f);
    }
    return {
      items,
      sin_tipo_cambio: conv.sinTipoCambio,
      totales_por_fecha: [...porFecha.values()]
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((f) => ({
          fecha: f.fecha,
          cantidad: f.cantidad,
          total_soles: redondear(f.total_soles).toFixed(2),
          por_cuenta: [...f.por_cuenta].map(([cuenta, total]) => ({ cuenta, total_soles: redondear(total).toFixed(2) })),
        })),
    };
  }

  async getById(id: number): Promise<ProgramacionRow> {
    const [row] = await this.listar({}, [id]);
    if (!row) throw new NotFoundException(`Programacion ${id} no encontrada`);
    return row;
  }

  // -------------------------------------------------------------- escritura

  /** Programa un lote en una transaccion: o se programa todo o nada. */
  async crear(dto: CreateProgramacionDto): Promise<ProgramacionRow[]> {
    const ids = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const creadas: number[] = [];
      // Orden estable por documento para no abrir interbloqueos entre lotes concurrentes.
      const items = [...dto.items].sort((a, b) => a.id_documento_origen - b.id_documento_origen);
      for (const item of items) {
        const concepto = item.concepto ?? 'PROVEEDOR';
        const doc = await this.bloquearDocumento(tx, item.id_documento_origen);
        this.validarFecha(item.fecha_programada, item.urgente ?? false, item.observaciones);
        if (Number(item.monto) <= 0) throw new BadRequestException('El monto debe ser mayor a 0');
        if (concepto === 'DETRACCION' && Number(doc.detraccion_monto ?? 0) <= 0) {
          throw new BadRequestException(`El documento ${doc.numero_documento ?? doc.id} no tiene detracción`);
        }
        const disponible = saldoProgramable(doc, concepto);
        if (Number(item.monto) > disponible + EPS) {
          throw new BadRequestException(
            `El monto (${item.monto}) supera el saldo por programar (${redondear(Math.max(disponible, 0)).toFixed(2)}) de ${concepto} en ${doc.numero_documento ?? doc.id}`,
          );
        }
        if (item.id_cuenta !== undefined) await this.validarCuenta(tx, item.id_cuenta);
        const destino = item.cuenta_destino ?? (concepto === 'DETRACCION' ? await this.cuentaDetraccionDe(tx, doc.id_anexo) : null);
        const [fila] = await q.rows<{ id: number }>({ id: I }, tx)`
          INSERT INTO pago_programado (id_documento_origen, concepto, fecha_programada, urgente, monto, medio_pago, id_cuenta,
                                       cuenta_destino, id_programado_por, observaciones)
          VALUES (${item.id_documento_origen}::int, ${concepto}::text, ${item.fecha_programada}::date, ${item.urgente ?? false}::boolean,
                  ${item.monto}::numeric, ${item.medio_pago}::text, NULLIF(${item.id_cuenta ?? 0}::int, 0),
                  NULLIF(${destino ?? ''}::text, ''), NULLIF(${dto.id_programado_por ?? 0}::int, 0),
                  NULLIF(${item.observaciones ?? ''}::text, ''))
          RETURNING id`;
        creadas.push(fila.id);
      }
      return creadas;
    });
    return this.listar({}, ids);
  }

  async actualizar(id: number, dto: UpdateProgramacionDto): Promise<ProgramacionRow> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [prog] = await q.rows<{
        id_documento_origen: number;
        concepto: string;
        estado: string;
        monto: string;
        fecha: string;
        urgente: boolean;
        observaciones: string | null;
      }>({ id_documento_origen: I, concepto: T, estado: T, monto: T, fecha: T, urgente: B, observaciones: TN }, tx)`
        SELECT id_documento_origen, concepto::text AS concepto, estado::text AS estado, monto::text AS monto,
               fecha_programada::text AS fecha, urgente, observaciones
          FROM pago_programado WHERE id = ${id}::int FOR UPDATE`;
      if (!prog) throw new NotFoundException(`Programacion ${id} no encontrada`);
      if (prog.estado !== 'PROGRAMADO') throw new ConflictException(`Una programación ${prog.estado} no se puede modificar`);
      const doc = await this.bloquearDocumento(tx, prog.id_documento_origen);

      const fecha = dto.fecha_programada ?? prog.fecha;
      const urgente = dto.urgente ?? prog.urgente;
      this.validarFecha(fecha, urgente, dto.observaciones ?? prog.observaciones ?? undefined);
      const monto = dto.monto ?? prog.monto;
      if (Number(monto) <= 0) throw new BadRequestException('El monto debe ser mayor a 0');
      const disponible = saldoProgramable(doc, prog.concepto, Number(prog.monto));
      if (Number(monto) > disponible + EPS) {
        throw new BadRequestException(`El monto (${monto}) supera el saldo por programar (${redondear(Math.max(disponible, 0)).toFixed(2)})`);
      }
      if (dto.id_cuenta !== undefined) await this.validarCuenta(tx, dto.id_cuenta);

      await q.run(tx)`
        UPDATE pago_programado SET
          fecha_programada = ${fecha}::date, urgente = ${urgente}::boolean, monto = ${monto}::numeric,
          medio_pago = CASE WHEN ${dto.medio_pago !== undefined}::boolean THEN ${dto.medio_pago ?? ''}::text ELSE medio_pago END,
          id_cuenta = CASE WHEN ${dto.id_cuenta !== undefined}::boolean THEN ${dto.id_cuenta ?? 0}::int ELSE id_cuenta END,
          cuenta_destino = CASE WHEN ${dto.cuenta_destino !== undefined}::boolean THEN NULLIF(${dto.cuenta_destino ?? ''}::text, '') ELSE cuenta_destino END,
          observaciones = CASE WHEN ${dto.observaciones !== undefined}::boolean THEN NULLIF(${dto.observaciones ?? ''}::text, '') ELSE observaciones END
         WHERE id = ${id}::int`;
    });
    return this.getById(id);
  }

  async cancelar(id: number): Promise<ProgramacionRow> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [prog] = await q.rows<{ estado: string; id_documento_origen: number }>({ estado: T, id_documento_origen: I }, tx)`
        SELECT estado::text AS estado, id_documento_origen FROM pago_programado WHERE id = ${id}::int FOR UPDATE`;
      if (!prog) throw new NotFoundException(`Programacion ${id} no encontrada`);
      if (prog.estado !== 'PROGRAMADO') throw new ConflictException(`Una programación ${prog.estado} no se puede cancelar`);
      await this.bloquearDocumento(tx, prog.id_documento_origen);
      await q.run(tx)`UPDATE pago_programado SET estado = 'CANCELADO' WHERE id = ${id}::int`;
    });
    return this.getById(id);
  }

  // ---------------------------------------------------------------- privado

  /** Bloquea el documento y devuelve su estado de pago actual (visto desde la propia transaccion). */
  private async bloquearDocumento(tx: Tx, id: number): Promise<DocumentoConsultado> {
    const doc = await bloquearYConsultar(this.sql, tx, id);
    if (!doc) throw new NotFoundException(`Documento de origen ${id} no encontrado`);
    if (doc.estado !== 'REGISTRADO') throw new ConflictException(`El documento ${doc.numero_documento ?? doc.id} está ${doc.estado}`);
    return doc;
  }

  private validarFecha(fecha: string, urgente: boolean, observaciones?: string): void {
    if (urgente) {
      if (!observaciones || observaciones.trim() === '') {
        throw new BadRequestException('Un pago urgente (fuera de viernes) necesita el motivo en observaciones');
      }
      return;
    }
    if (!esViernes(fecha)) {
      throw new BadRequestException(`Los pagos se programan los viernes (${fecha} no lo es); marque el pago como urgente e indique el motivo`);
    }
  }

  private async validarCuenta(tx: Tx, idCuenta: number): Promise<void> {
    const q = sqlTag(this.sql);
    const [c] = await q.rows<{ estado: boolean }>({ estado: B }, tx)`SELECT estado FROM cuenta_tesoreria WHERE id = ${idCuenta}::int`;
    if (!c) throw new BadRequestException(`Cuenta ${idCuenta} no existe`);
    if (!c.estado) throw new BadRequestException(`La cuenta ${idCuenta} está inactiva`);
  }

  private async cuentaDetraccionDe(tx: Tx, idAnexo: number | null): Promise<string | null> {
    if (!idAnexo) return null;
    const q = sqlTag(this.sql);
    const [a] = await q.rows<{ c: string | null }>({ c: TN }, tx)`SELECT cuenta_detraccion::text AS c FROM anexos WHERE id = ${idAnexo}::int`;
    return a?.c ?? null;
  }

  private async listar(query: ListProgramacionQueryDto, ids: number[] = []): Promise<ProgramacionRow[]> {
    const q = sqlTag(this.sql);
    const desde = query.desde ?? '1900-01-01';
    const hasta = query.hasta ?? '9999-12-31';
    const estado = ids.length > 0 ? '' : (query.estado ?? 'PROGRAMADO');
    const concepto = query.concepto ?? '';
    const cuenta = query.id_cuenta ?? 0;
    const lista = csv(ids);
    const rows = await q.rows<Omit<ProgramacionRow, 'monto_soles'>>(PROG_SPEC)`
      SELECT g.id, g.id_documento_origen, o.numero_documento::text AS numero_documento, o.clase_documento::text AS clase_documento,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, cc.centro_costo::text AS centro_costo,
             o.moneda_id::text AS moneda_id, o.moneda_simbolo::text AS moneda_simbolo, g.concepto::text AS concepto,
             g.fecha_programada::text AS fecha_programada, g.urgente, g.monto::text AS monto, g.medio_pago::text AS medio_pago,
             g.id_cuenta, c.nombre::text AS cuenta, g.cuenta_destino::text AS cuenta_destino, g.estado::text AS estado, g.observaciones
        FROM pago_programado g
        JOIN "documentosOrigen" o ON o.id = g.id_documento_origen
        LEFT JOIN anexos a ON a.id = o.id_anexo
        LEFT JOIN "CentroCostos" cc ON cc.id = o.id_centro_costo
        LEFT JOIN cuenta_tesoreria c ON c.id = g.id_cuenta
       WHERE (${lista}::text = '' OR g.id = ANY(string_to_array(${lista}::text, ',')::int[]))
         AND g.fecha_programada >= ${desde}::date AND g.fecha_programada <= ${hasta}::date
         AND (${estado}::text = '' OR g.estado = ${estado}::text)
         AND (${concepto}::text = '' OR g.concepto = ${concepto}::text)
         AND (${cuenta}::int = 0 OR g.id_cuenta = ${cuenta}::int)
       ORDER BY g.fecha_programada, g.id`;
    return rows.map((r) => ({ ...r, monto_soles: r.monto }));
  }
}

export type { ProgramacionItemDto };
