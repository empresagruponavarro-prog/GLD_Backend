import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { CotizacionHandler } from '../../requerimientos/cotizaciones/cotizacion.handler.js';
import { RequerimientoHandler } from '../../requerimientos/requerimiento/requerimiento.handler.js';
import { saldosPago } from '../../tesoreria/shared/do-saldos-pago.js';
import { consultarDocumentos, type DocumentoConsultado } from '../../tesoreria/shared/documentos-consulta.js';
import {
  IGV_PCT,
  RETENCION_PCT,
  UMBRAL_SOLES,
  calcularTributos,
  netoProveedor,
  redondear,
} from '../../tesoreria/shared/tributos.js';
import { insertarDocumentoOrigen, totalEnSoles } from '../shared/documento-origen-insert.js';
import {
  AnularDocumentoDto,
  CreateDocumentoDirectoDto,
  ListDocumentosAdminQueryDto,
  UpdateDeduccionesDto,
} from './administracion.dto.js';

export interface DocumentoDetalle extends Omit<DocumentoConsultado, 'total_filas'> {
  lineas: Array<Record<string, unknown>>;
  programaciones: Array<Record<string, unknown>>;
  pagos: Array<Record<string, unknown>>;
  retencion_motivo: string;
}

const EPS = 0.005;
const CLASES_RETENIDAS = ['ORDEN_COMPRA', 'ORDEN_SERVICIO', 'PAGO_SERVICIO', 'OTRO'];

@Injectable()
export class AdministracionHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
    private readonly requerimientos: RequerimientoHandler,
    private readonly cotizaciones: CotizacionHandler,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(query: ListDocumentosAdminQueryDto): Promise<Paginated<Omit<DocumentoConsultado, 'total_filas'>>> {
    const { page, pageSize, offset } = pageParams(query);
    const rows = await consultarDocumentos(this.sql, query, pageSize, offset);
    const total = rows[0]?.total_filas ?? 0;
    return toPaginated(
      rows.map(({ total_filas: _t, ...r }) => r),
      total,
      page,
      pageSize,
    );
  }

  async getById(id: number): Promise<DocumentoDetalle> {
    const [row] = await consultarDocumentos(this.sql, { id }, 1, 0);
    if (!row) throw new NotFoundException(`Documento de origen ${id} no encontrado`);
    const { total_filas: _t, ...doc } = row;
    const q = sqlTag(this.sql);

    const lineas = await q.rows<Record<string, unknown>>({
      id: I,
      codigo: TN,
      descripcion: TN,
      tipo_producto: TN,
      cantidad: T,
      precio: T,
      monto: T,
      id_requerimiento_detalle: IN,
    })`
      SELECT l.id, l."ProductoCodigo"::text AS codigo, p.descripcion::text AS descripcion, l."TipoProducto"::text AS tipo_producto,
             COALESCE(l."Cantidad", 0)::text AS cantidad, COALESCE(l."Precio", 0)::text AS precio, COALESCE(l.monto, 0)::text AS monto,
             l.id_requerimiento_detalle
        FROM "ordenCompraDetalle" l LEFT JOIN producto p ON p.id = l.id_producto
       WHERE l.id_orden_compra = ${id}::int ORDER BY l.id`;

    const programaciones = await q.rows<Record<string, unknown>>({
      id: I,
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
    })`
      SELECT g.id, g.concepto::text AS concepto, g.fecha_programada::text AS fecha_programada, g.urgente, g.monto::text AS monto,
             g.medio_pago::text AS medio_pago, g.id_cuenta, c.nombre::text AS cuenta, g.cuenta_destino::text AS cuenta_destino,
             g.estado::text AS estado, g.observaciones
        FROM pago_programado g LEFT JOIN cuenta_tesoreria c ON c.id = g.id_cuenta
       WHERE g.id_documento_origen = ${id}::int ORDER BY g.fecha_programada, g.id`;

    const pagos = await q.rows<Record<string, unknown>>({
      id: I,
      numero: T,
      concepto: T,
      fecha_pago: T,
      monto: T,
      medio_pago: T,
      cuenta: TN,
      numero_operacion: TN,
      estado: T,
    })`
      SELECT p.id, p.numero::text AS numero, p.concepto::text AS concepto, p.fecha_pago::text AS fecha_pago, p.monto::text AS monto,
             p.medio_pago::text AS medio_pago, c.nombre::text AS cuenta, p.numero_operacion::text AS numero_operacion, p.estado::text AS estado
        FROM pago p LEFT JOIN cuenta_tesoreria c ON c.id = p.id_cuenta
       WHERE p.id_documento_origen = ${id}::int ORDER BY p.id`;

    return { ...doc, lineas, programaciones, pagos, retencion_motivo: await this.motivoRetencion(doc) };
  }

  /** FUR, cuadro comparativo, documento, recepciones, programaciones y pagos del expediente. */
  async expediente(id: number) {
    const documento = await this.getById(id);
    const q = sqlTag(this.sql);
    const recepciones = await q.rows<Record<string, unknown>>({
      id: I,
      numero: T,
      fecha: T,
      estado: T,
      lineas: I,
    })`
      SELECT a.id, a.numero::text AS numero, a.fecha::text AS fecha, a.estado::text AS estado,
             (SELECT count(*)::int FROM almacen_documento_detalle d WHERE d.id_documento = a.id) AS lineas
        FROM almacen_documento a WHERE a.id_orden_compra = ${id}::int ORDER BY a.id`;
    const idFur = documento.id_requerimiento;
    return {
      documento,
      requerimiento: idFur ? await this.requerimientos.getById(idFur) : null,
      cuadro_comparativo: idFur ? await this.cuadroSiHay(idFur) : null,
      recepciones,
    };
  }

  // -------------------------------------------------------------- escritura

  /** Gasto financiero, pago de servicios, otros, planillas o caja chica sin pasar por FUR (sin lineas). */
  async crearDirecto(dto: CreateDocumentoDirectoDto): Promise<DocumentoDetalle> {
    const id = await this.db.transaction(async (tx) => {
      await this.validarReferencias(tx, dto.id_anexo, dto.id_centro_costo, dto.id_fase, dto.id_area);
      const doc = await insertarDocumentoOrigen(this.sql, this.ledger, tx, {
        clase: dto.clase_documento as never,
        tipoOc: null,
        idCentroCosto: dto.id_centro_costo ?? null,
        idFase: dto.id_fase ?? null,
        idArea: dto.id_area ?? null,
        idAnexo: dto.id_anexo,
        idCategoria: null,
        fechaEmision: dto.fecha_emision,
        formaPago: dto.forma_pago ?? null,
        monedaId: dto.moneda_id ?? 'PEN',
        monedaSimbolo: dto.moneda_simbolo ?? (dto.moneda_id && dto.moneda_id !== 'PEN' ? null : 'S/'),
        monto: Number(dto.monto),
        afectoIgv: dto.afecto_igv ?? true,
        diasCredito: dto.dias_credito ?? null,
        fechaVencimiento: dto.fecha_vencimiento ?? null,
        comentarios: dto.concepto,
        idRequerimiento: null,
        idCotizacion: null,
        detraccionPorcentaje: dto.detraccion_porcentaje,
        retencionManual: dto.retencion_monto,
        renta4ta: dto.renta_4ta,
        dsctoCompras: dto.dscto_compras,
        dsctoIntervencion: dto.dscto_intervencion,
        dsctoOtros: dto.dscto_otros,
        lineas: [],
      });
      return doc.id;
    });
    return this.getById(id);
  }

  async actualizarDeducciones(id: number, dto: UpdateDeduccionesDto): Promise<DocumentoDetalle> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [doc] = await q.rows<{
        estado: string;
        clase: string;
        monto: string;
        total: string;
        afecto: boolean;
        moneda_id: string | null;
        simbolo: string | null;
        id_anexo: number | null;
        emision: string | null;
        det_pct: string | null;
        ret_manual: boolean;
        ret_monto: string | null;
        renta: string;
        dc: string;
        di: string;
        dotros: string;
      }>(
        {
          estado: T, clase: T, monto: T, total: T, afecto: B, moneda_id: TN, simbolo: TN, id_anexo: IN, emision: TN,
          det_pct: TN, ret_manual: B, ret_monto: TN, renta: T, dc: T, di: T, dotros: T,
        },
        tx,
      )`
        SELECT estado::text AS estado, COALESCE(clase_documento::text, 'OTRO') AS clase, COALESCE(monto, 0)::text AS monto,
               COALESCE(total, 0)::text AS total, afecto_igv AS afecto, moneda_id::text AS moneda_id, moneda_simbolo::text AS simbolo,
               id_anexo, fecha_emision::date::text AS emision, detraccion_porcentaje::text AS det_pct, retencion_manual AS ret_manual,
               retencion_monto::text AS ret_monto, COALESCE(renta_4ta, 0)::text AS renta, COALESCE(dscto_compras, 0)::text AS dc,
               COALESCE(dscto_intervencion, 0)::text AS di, COALESCE(dscto_otros, 0)::text AS dotros
          FROM "documentosOrigen" WHERE id = ${id}::int FOR UPDATE`;
      if (!doc) throw new NotFoundException(`Documento de origen ${id} no encontrado`);
      if (doc.estado !== 'REGISTRADO') throw new ConflictException(`Un documento ${doc.estado} no se puede modificar`);

      const cambiaMontos =
        dto.renta_4ta !== undefined ||
        dto.dscto_compras !== undefined ||
        dto.dscto_intervencion !== undefined ||
        dto.dscto_otros !== undefined ||
        dto.detraccion_porcentaje !== undefined ||
        dto.retencion_monto !== undefined ||
        dto.afecto_igv !== undefined;
      const saldos = (await saldosPago(this.sql, [id], tx)).get(id);
      if (cambiaMontos && saldos && (saldos.PROVEEDOR.pagado > 0 || saldos.DETRACCION.pagado > 0)) {
        throw new ConflictException('El documento ya tiene pagos registrados; anule los pagos antes de cambiar montos o deducciones');
      }
      if (dto.id_area !== undefined) {
        const [a] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM area WHERE id = ${dto.id_area}::int AND estado`;
        if (!a) throw new BadRequestException(`Área ${dto.id_area} no existe o está inactiva`);
      }

      const afecto = dto.afecto_igv ?? doc.afecto;
      const monto = Number(doc.monto);
      const igv = afecto ? redondear((monto * IGV_PCT) / 100) : 0;
      const total = redondear(monto + igv);
      const renta = dto.renta_4ta ?? Number(doc.renta);
      const dc = dto.dscto_compras ?? Number(doc.dc);
      const di = dto.dscto_intervencion ?? Number(doc.di);
      const dotros = dto.dscto_otros ?? Number(doc.dotros);

      const [prov] = doc.id_anexo
        ? await q.rows<{ ex: boolean }>({ ex: B }, tx)`SELECT COALESCE(exceptuado_retencion, false) AS ex FROM anexos WHERE id = ${doc.id_anexo}::int`
        : [];
      const totalSoles = await totalEnSoles(this.sql, tx, total, doc.moneda_id, doc.simbolo, doc.emision ?? new Date().toISOString().slice(0, 10));
      let retencionManual: number | undefined;
      if (dto.retencion_monto === null) retencionManual = undefined;
      else if (dto.retencion_monto !== undefined) retencionManual = dto.retencion_monto;
      else if (doc.ret_manual) retencionManual = Number(doc.ret_monto ?? 0);
      const trib = calcularTributos({
        clase: doc.clase,
        afectoIgv: afecto,
        total,
        totalSoles,
        proveedorExceptuado: prov?.ex ?? false,
        detraccionPorcentaje: dto.detraccion_porcentaje ?? (doc.det_pct === null ? 0 : Number(doc.det_pct)),
        retencionManual,
      });

      const neto = netoProveedor({
        total,
        renta4ta: renta,
        dsctoCompras: dc,
        dsctoIntervencion: di,
        dsctoOtros: dotros,
        detraccionPorcentaje: trib.detraccion_porcentaje,
        retencionMonto: trib.retencion_monto,
      });
      if (neto < -EPS) throw new BadRequestException('Las deducciones superan el total del documento');
      if (saldos && saldos.PROVEEDOR.programado + saldos.PROVEEDOR.pagado > neto + EPS) {
        throw new ConflictException('El nuevo monto a pagar es menor a lo ya programado; cancele programaciones primero');
      }
      if (saldos && saldos.DETRACCION.programado + saldos.DETRACCION.pagado > (trib.detraccion_monto ?? 0) + EPS) {
        throw new ConflictException('La nueva detracción es menor a lo ya programado; cancele programaciones primero');
      }

      await q.run(tx)`
        UPDATE "documentosOrigen" SET
          afecto_igv = ${afecto}::boolean, igv = ${String(igv)}::numeric, total = ${String(total)}::numeric,
          renta_4ta = ${String(renta)}::numeric, dscto_compras = ${String(dc)}::numeric,
          dscto_intervencion = ${String(di)}::numeric, dscto_otros = ${String(dotros)}::numeric,
          detraccion_porcentaje = CASE WHEN ${trib.detraccion_porcentaje !== null}::boolean THEN ${String(trib.detraccion_porcentaje ?? 0)}::numeric END,
          detraccion_monto = CASE WHEN ${trib.detraccion_monto !== null}::boolean THEN ${String(trib.detraccion_monto ?? 0)}::numeric END,
          retencion_porcentaje = CASE WHEN ${trib.retencion_porcentaje !== null}::boolean THEN ${String(trib.retencion_porcentaje ?? 0)}::numeric END,
          retencion_monto = CASE WHEN ${trib.retencion_monto !== null}::boolean THEN ${String(trib.retencion_monto ?? 0)}::numeric END,
          retencion_manual = ${trib.retencion_manual}::boolean,
          dias_credito = CASE WHEN ${dto.dias_credito !== undefined}::boolean THEN ${dto.dias_credito ?? 0}::int ELSE dias_credito END,
          fecha_vencimiento = CASE WHEN ${dto.fecha_vencimiento !== undefined}::boolean
                                   THEN NULLIF(${dto.fecha_vencimiento ?? ''}::text, '')::date ELSE fecha_vencimiento END,
          id_area = CASE WHEN ${dto.id_area !== undefined}::boolean THEN ${dto.id_area ?? 0}::int ELSE id_area END
         WHERE id = ${id}::int`;
    });
    return this.getById(id);
  }

  async anular(id: number, dto: AnularDocumentoDto): Promise<DocumentoDetalle> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [doc] = await q.rows<{ estado: string }>({ estado: T }, tx)`
        SELECT estado::text AS estado FROM "documentosOrigen" WHERE id = ${id}::int FOR UPDATE`;
      if (!doc) throw new NotFoundException(`Documento de origen ${id} no encontrado`);
      if (doc.estado === 'ANULADO') throw new ConflictException('El documento ya está anulado');

      const [dep] = await q.rows<{ pagos: number; prog: number; recep: number }>({ pagos: I, prog: I, recep: I }, tx)`
        SELECT (SELECT count(*)::int FROM pago WHERE id_documento_origen = ${id}::int AND estado = 'REGISTRADO') AS pagos,
               (SELECT count(*)::int FROM pago_programado WHERE id_documento_origen = ${id}::int AND estado = 'PROGRAMADO') AS prog,
               (SELECT count(*)::int FROM almacen_documento WHERE id_orden_compra = ${id}::int AND estado = 'REGISTRADO') AS recep`;
      if (dep.pagos > 0) throw new ConflictException('El documento tiene pagos registrados; anúlelos primero');
      if (dep.prog > 0) throw new ConflictException('El documento tiene pagos programados; cancélelos primero');
      if (dep.recep > 0) throw new ConflictException('El documento tiene recepciones de almacén vigentes; anúlelas primero');

      await q.run(tx)`
        UPDATE "documentosOrigen" SET estado = 'ANULADO',
               comentarios = CASE WHEN ${(dto.motivo ?? '') !== ''}::boolean
                                  THEN COALESCE(comentarios || E'\n', '') || 'ANULADO: ' || ${dto.motivo ?? ''}::text
                                  ELSE comentarios END
         WHERE id = ${id}::int`;
    });
    return this.getById(id);
  }

  // ---------------------------------------------------------------- privado

  private async cuadroSiHay(idFur: number) {
    try {
      return await this.cotizaciones.cuadroComparativo(idFur);
    } catch {
      return null;
    }
  }

  private async validarReferencias(
    tx: Tx,
    idAnexo: number,
    idCentroCosto?: number,
    idFase?: number,
    idArea?: number,
  ): Promise<void> {
    const q = sqlTag(this.sql);
    const [a] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM anexos WHERE id = ${idAnexo}::int`;
    if (!a) throw new BadRequestException(`Anexo ${idAnexo} no existe`);
    if (idCentroCosto !== undefined) {
      const [c] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "CentroCostos" WHERE id = ${idCentroCosto}::int`;
      if (!c) throw new BadRequestException(`Centro de costos ${idCentroCosto} no existe`);
    }
    if (idFase !== undefined) {
      const [f] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "ppto_Fases" WHERE id = ${idFase}::int`;
      if (!f) throw new BadRequestException(`Fase ${idFase} no existe`);
    }
    if (idArea !== undefined) {
      const [ar] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM area WHERE id = ${idArea}::int AND estado`;
      if (!ar) throw new BadRequestException(`Área ${idArea} no existe o está inactiva`);
    }
  }

  /** Motivo legible de por que aplica o no la retencion, para mostrarlo junto a las deducciones. */
  private async motivoRetencion(doc: Omit<DocumentoConsultado, 'total_filas'>): Promise<string> {
    if (doc.retencion_manual) return 'Monto ingresado manualmente';
    if (doc.retencion_monto !== null && Number(doc.retencion_monto) > 0) {
      return `${doc.retencion_porcentaje ?? RETENCION_PCT} % — proveedor no exceptuado, total mayor a S/ ${UMBRAL_SOLES}`;
    }
    if (!CLASES_RETENIDAS.includes(doc.clase_documento ?? '')) return 'No aplica: la clase de documento no se retiene';
    if (!doc.afecto_igv) return 'No aplica: operacion no afecta al IGV';
    const q = sqlTag(this.sql);
    const prov = doc.id_anexo
      ? (
          await q.rows<{ ex: boolean }>({ ex: B })`
            SELECT COALESCE(exceptuado_retencion, false) AS ex FROM anexos WHERE id = ${doc.id_anexo}::int`
        )[0]
      : undefined;
    if (prov?.ex) return 'No aplica: proveedor exceptuado de retencion';
    if (doc.detraccion_monto !== null && Number(doc.detraccion_monto) > 0) return 'No aplica: el documento tiene detraccion';
    return `No aplica: total no supera S/ ${UMBRAL_SOLES}`;
  }
}
