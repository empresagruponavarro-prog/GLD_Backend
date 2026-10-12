import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { claveMoneda, tcVigente } from '../../tesoreria/shared/tipo-cambio.js';
import { IGV_PCT, esSoles, redondear } from '../../tesoreria/shared/tributos.js';
import { bloquearRequerimiento } from '../shared/requerimiento-eventos.js';
import {
  CotizacionLineaDto,
  CotizacionLineaResponseDto,
  CotizacionResponseDto,
  CreateCotizacionDto,
  CuadroComparativoDto,
  UpdateCotizacionDto,
} from './cotizacion.dto.js';

const CAB_SPEC = {
  id: I,
  numero: T,
  id_requerimiento: I,
  id_proveedor: I,
  proveedor: TN,
  fecha: T,
  referencia: TN,
  moneda_id: T,
  moneda_simbolo: TN,
  incluye_igv: B,
  afecto_igv: B,
  forma_pago: T,
  dias_credito: I,
  adelanto_porcentaje: TN,
  medio_pago: TN,
  plazo_entrega_dias: IN,
  validez_dias: IN,
  garantia: TN,
  condiciones: TN,
  archivo_url: TN,
} as const;

interface CabeceraRow {
  id: number;
  numero: string;
  id_requerimiento: number;
  id_proveedor: number;
  proveedor: string | null;
  fecha: string;
  referencia: string | null;
  moneda_id: string;
  moneda_simbolo: string | null;
  incluye_igv: boolean;
  afecto_igv: boolean;
  forma_pago: string;
  dias_credito: number;
  adelanto_porcentaje: string | null;
  medio_pago: string | null;
  plazo_entrega_dias: number | null;
  validez_dias: number | null;
  garantia: string | null;
  condiciones: string | null;
  archivo_url: string | null;
}

interface LineaRow {
  id: number;
  id_cotizacion: number;
  id_requerimiento_detalle: number;
  codigo: string;
  descripcion: string;
  unidad: string;
  cotiza: boolean;
  cantidad: string;
  precio_unitario: string;
  plazo_entrega_dias: number | null;
  marca_modelo: string | null;
  observaciones: string | null;
}

/** Precio sin y con IGV de una oferta (el proveedor puede cotizar con o sin IGV; los no afectos no tienen IGV). */
export function preciosOferta(precio: number, incluyeIgv: boolean, afecto: boolean): { sin: number; con: number } {
  const sin = incluyeIgv && afecto ? precio / (1 + IGV_PCT / 100) : precio;
  const con = afecto ? sin * (1 + IGV_PCT / 100) : sin;
  return { sin, con };
}

/** Totales de una cotizacion a partir de sus lineas cotizadas. */
export function totalesCotizacion(
  lineas: Array<{ cotiza: boolean; cantidad: number; precio: number }>,
  incluyeIgv: boolean,
  afecto: boolean,
): { subtotal: number; igv: number; total: number } {
  const subtotal = redondear(
    lineas.filter((l) => l.cotiza).reduce((a, l) => a + l.cantidad * preciosOferta(l.precio, incluyeIgv, afecto).sin, 0),
  );
  const igv = afecto ? redondear((subtotal * IGV_PCT) / 100) : 0;
  return { subtotal, igv, total: redondear(subtotal + igv) };
}

const f2 = (n: number) => redondear(n, 2).toFixed(2);
const f4 = (n: number) => redondear(n, 4).toFixed(4);

@Injectable()
export class CotizacionHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(idRequerimiento: number): Promise<CotizacionResponseDto[]> {
    await this.existeRequerimiento(idRequerimiento);
    return this.cargar(idRequerimiento);
  }

  async getById(idRequerimiento: number, id: number): Promise<CotizacionResponseDto> {
    const [cot] = (await this.cargar(idRequerimiento)).filter((c) => c.id === id);
    if (!cot) throw new NotFoundException(`Cotizacion ${id} no encontrada en el requerimiento ${idRequerimiento}`);
    return cot;
  }

  /** Matriz linea x proveedor para que el aprobador elija; no marca ganador sugerido. */
  async cuadroComparativo(idRequerimiento: number): Promise<CuadroComparativoDto> {
    const q = sqlTag(this.sql);
    const [fur] = await q.rows<{
      id: number;
      numero: string;
      estado: string;
      tipo: string;
      id_cotizacion_ganadora: number | null;
      comentario_adjudicacion: string | null;
    }>({ id: I, numero: T, estado: T, tipo: T, id_cotizacion_ganadora: IN, comentario_adjudicacion: TN })`
      SELECT id, numero::text AS numero, estado::text AS estado, tipo::text AS tipo, id_cotizacion_ganadora, comentario_adjudicacion
        FROM requerimiento WHERE id = ${idRequerimiento}::int`;
    if (!fur) throw new NotFoundException(`Requerimiento ${idRequerimiento} no encontrado`);

    const cotizaciones = await this.cargar(idRequerimiento);
    const lineas = await q.rows<{ id: number; codigo: string; descripcion: string; unidad: string; cantidad: string }>({
      id: I,
      codigo: T,
      descripcion: T,
      unidad: T,
      cantidad: T,
    })`
      SELECT d.id, p.codigo::text AS codigo, p.descripcion::text AS descripcion, COALESCE(u.simbolo, u.codigo)::text AS unidad,
             d.cantidad::text AS cantidad
        FROM requerimiento_detalle d JOIN producto p ON p.id = d.id_producto JOIN unidad_medida u ON u.id = p.id_unidad_medida
       WHERE d.id_requerimiento = ${idRequerimiento}::int ORDER BY d.id`;

    const proveedores = [];
    for (const c of cotizaciones) {
      let totalSoles: string | null = null;
      let tcUsado: string | null = null;
      if (esSoles(c.moneda_id, c.moneda_simbolo)) {
        totalSoles = c.total;
      } else {
        const tc = await tcVigente(this.sql, claveMoneda(c.moneda_id, c.moneda_simbolo), c.fecha);
        if (tc) {
          tcUsado = tc.venta;
          totalSoles = f2(Number(c.total) * Number(tc.venta));
        }
      }
      proveedores.push({
        id_cotizacion: c.id,
        numero: c.numero,
        id_proveedor: c.id_proveedor,
        proveedor: c.proveedor,
        moneda_id: c.moneda_id,
        moneda_simbolo: c.moneda_simbolo,
        forma_pago: c.forma_pago,
        dias_credito: c.dias_credito,
        adelanto_porcentaje: c.adelanto_porcentaje,
        medio_pago: c.medio_pago,
        plazo_entrega_dias: c.plazo_entrega_dias,
        validez_dias: c.validez_dias,
        garantia: c.garantia,
        condiciones: c.condiciones,
        afecto_igv: c.afecto_igv,
        incluye_igv: c.incluye_igv,
        total_sin_igv: c.total_sin_igv,
        igv: c.igv,
        total: c.total,
        total_soles: totalSoles,
        tc_usado: tcUsado,
        es_ganadora: c.es_ganadora,
      });
    }

    return {
      id_requerimiento: fur.id,
      numero: fur.numero,
      estado: fur.estado,
      tipo: fur.tipo,
      id_cotizacion_ganadora: fur.id_cotizacion_ganadora,
      comentario_adjudicacion: fur.comentario_adjudicacion,
      lineas: lineas.map((l) => ({
        id_detalle: l.id,
        codigo: l.codigo,
        descripcion: l.descripcion,
        unidad: l.unidad,
        cantidad: l.cantidad,
        ofertas: cotizaciones.flatMap((c) =>
          c.lineas
            .filter((x) => x.id_requerimiento_detalle === l.id)
            .map((x) => ({
              id_cotizacion: c.id,
              cotiza: x.cotiza,
              cantidad: x.cantidad,
              precio_sin_igv: x.precio_sin_igv,
              precio_con_igv: x.precio_con_igv,
              subtotal_sin_igv: x.subtotal_sin_igv,
              plazo_entrega_dias: x.plazo_entrega_dias ?? c.plazo_entrega_dias,
            })),
        ),
      })),
      proveedores,
    };
  }

  // -------------------------------------------------------------- escritura

  async create(idRequerimiento: number, dto: CreateCotizacionDto): Promise<CotizacionResponseDto> {
    const id = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      await this.bloquearParaCotizar(tx, idRequerimiento);
      await this.validarProveedor(tx, dto.id_proveedor);
      const [dup] = await q.rows<{ id: number }>({ id: I }, tx)`
        SELECT id FROM cotizacion WHERE id_requerimiento = ${idRequerimiento}::int AND id_proveedor = ${dto.id_proveedor}::int`;
      if (dup) throw new ConflictException('Ese proveedor ya tiene una cotizacion en este requerimiento; edite la existente');
      await this.validarLineas(tx, idRequerimiento, dto.lineas);

      const numero = await this.ledger.siguienteNumero(tx, 'COT');
      const [cot] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO cotizacion (numero, id_requerimiento, id_proveedor, fecha, referencia, moneda_id, moneda_simbolo, incluye_igv,
                                afecto_igv, forma_pago, dias_credito, adelanto_porcentaje, medio_pago, plazo_entrega_dias,
                                validez_dias, garantia, condiciones, archivo_url)
        VALUES (${numero}::text, ${idRequerimiento}::int, ${dto.id_proveedor}::int, ${dto.fecha}::date,
                NULLIF(${dto.referencia ?? ''}::text, ''), ${dto.moneda_id}::text, NULLIF(${dto.moneda_simbolo ?? ''}::text, ''),
                ${dto.incluye_igv ?? false}::boolean, ${dto.afecto_igv ?? true}::boolean, ${dto.forma_pago}::text,
                ${dto.dias_credito ?? 0}::int, CASE WHEN ${dto.adelanto_porcentaje !== undefined}::boolean THEN ${dto.adelanto_porcentaje ?? '0'}::numeric END,
                NULLIF(${dto.medio_pago ?? ''}::text, ''), CASE WHEN ${dto.plazo_entrega_dias !== undefined}::boolean THEN ${dto.plazo_entrega_dias ?? 0}::int END,
                CASE WHEN ${dto.validez_dias !== undefined}::boolean THEN ${dto.validez_dias ?? 0}::int END,
                NULLIF(${dto.garantia ?? ''}::text, ''), NULLIF(${dto.condiciones ?? ''}::text, ''), NULLIF(${dto.archivo_url ?? ''}::text, ''))
        RETURNING id`;
      await this.insertarLineas(tx, cot.id, dto.lineas);
      return cot.id;
    });
    return this.getById(idRequerimiento, id);
  }

  async update(idRequerimiento: number, id: number, dto: UpdateCotizacionDto): Promise<CotizacionResponseDto> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      await this.bloquearParaCotizar(tx, idRequerimiento);
      const [actual] = await q.rows<{ id: number; id_proveedor: number }>({ id: I, id_proveedor: I }, tx)`
        SELECT id, id_proveedor FROM cotizacion WHERE id = ${id}::int AND id_requerimiento = ${idRequerimiento}::int FOR UPDATE`;
      if (!actual) throw new NotFoundException(`Cotizacion ${id} no encontrada en el requerimiento ${idRequerimiento}`);
      if (dto.id_proveedor !== undefined && dto.id_proveedor !== actual.id_proveedor) {
        await this.validarProveedor(tx, dto.id_proveedor);
        const [dup] = await q.rows<{ id: number }>({ id: I }, tx)`
          SELECT id FROM cotizacion WHERE id_requerimiento = ${idRequerimiento}::int AND id_proveedor = ${dto.id_proveedor}::int`;
        if (dup) throw new ConflictException('Ese proveedor ya tiene una cotizacion en este requerimiento');
      }
      if (dto.lineas) await this.validarLineas(tx, idRequerimiento, dto.lineas);

      await q.run(tx)`
        UPDATE cotizacion SET
          id_proveedor = CASE WHEN ${dto.id_proveedor !== undefined}::boolean THEN ${dto.id_proveedor ?? 0}::int ELSE id_proveedor END,
          fecha = CASE WHEN ${dto.fecha !== undefined}::boolean THEN ${dto.fecha ?? '1900-01-01'}::date ELSE fecha END,
          referencia = CASE WHEN ${dto.referencia !== undefined}::boolean THEN NULLIF(${dto.referencia ?? ''}::text, '') ELSE referencia END,
          moneda_id = CASE WHEN ${dto.moneda_id !== undefined}::boolean THEN ${dto.moneda_id ?? ''}::text ELSE moneda_id END,
          moneda_simbolo = CASE WHEN ${dto.moneda_simbolo !== undefined}::boolean THEN NULLIF(${dto.moneda_simbolo ?? ''}::text, '') ELSE moneda_simbolo END,
          incluye_igv = CASE WHEN ${dto.incluye_igv !== undefined}::boolean THEN ${dto.incluye_igv ?? false}::boolean ELSE incluye_igv END,
          afecto_igv = CASE WHEN ${dto.afecto_igv !== undefined}::boolean THEN ${dto.afecto_igv ?? true}::boolean ELSE afecto_igv END,
          forma_pago = CASE WHEN ${dto.forma_pago !== undefined}::boolean THEN ${dto.forma_pago ?? ''}::text ELSE forma_pago END,
          dias_credito = CASE WHEN ${dto.dias_credito !== undefined}::boolean THEN ${dto.dias_credito ?? 0}::int ELSE dias_credito END,
          adelanto_porcentaje = CASE WHEN ${dto.adelanto_porcentaje !== undefined}::boolean THEN ${dto.adelanto_porcentaje ?? '0'}::numeric ELSE adelanto_porcentaje END,
          medio_pago = CASE WHEN ${dto.medio_pago !== undefined}::boolean THEN NULLIF(${dto.medio_pago ?? ''}::text, '') ELSE medio_pago END,
          plazo_entrega_dias = CASE WHEN ${dto.plazo_entrega_dias !== undefined}::boolean THEN ${dto.plazo_entrega_dias ?? 0}::int ELSE plazo_entrega_dias END,
          validez_dias = CASE WHEN ${dto.validez_dias !== undefined}::boolean THEN ${dto.validez_dias ?? 0}::int ELSE validez_dias END,
          garantia = CASE WHEN ${dto.garantia !== undefined}::boolean THEN NULLIF(${dto.garantia ?? ''}::text, '') ELSE garantia END,
          condiciones = CASE WHEN ${dto.condiciones !== undefined}::boolean THEN NULLIF(${dto.condiciones ?? ''}::text, '') ELSE condiciones END,
          archivo_url = CASE WHEN ${dto.archivo_url !== undefined}::boolean THEN NULLIF(${dto.archivo_url ?? ''}::text, '') ELSE archivo_url END
         WHERE id = ${id}::int`;

      if (dto.lineas) {
        await q.run(tx)`DELETE FROM cotizacion_detalle WHERE id_cotizacion = ${id}::int`;
        await this.insertarLineas(tx, id, dto.lineas);
      }
    });
    return this.getById(idRequerimiento, id);
  }

  async delete(idRequerimiento: number, id: number): Promise<{ deleted: boolean; id: number }> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      await this.bloquearParaCotizar(tx, idRequerimiento);
      const n = await q.run(tx)`DELETE FROM cotizacion WHERE id = ${id}::int AND id_requerimiento = ${idRequerimiento}::int`;
      if (n === 0) throw new NotFoundException(`Cotizacion ${id} no encontrada en el requerimiento ${idRequerimiento}`);
    });
    return { deleted: true, id };
  }

  // ---------------------------------------------------------------- privado

  private async existeRequerimiento(id: number): Promise<void> {
    const q = sqlTag(this.sql);
    const [r] = await q.rows<{ id: number }>({ id: I })`SELECT id FROM requerimiento WHERE id = ${id}::int`;
    if (!r) throw new NotFoundException(`Requerimiento ${id} no encontrado`);
  }

  /** Solo se cotiza un FUR de compra en ENVIADO; devuelve el FUR bloqueado. */
  private async bloquearParaCotizar(tx: Tx, idRequerimiento: number) {
    const fur = await bloquearRequerimiento(this.sql, tx, idRequerimiento);
    if (!fur) throw new NotFoundException(`Requerimiento ${idRequerimiento} no encontrado`);
    if (fur.tipo !== 'COMPRA') throw new ConflictException('Solo los requerimientos de compra llevan cotizaciones');
    if (fur.estado !== 'ENVIADO') {
      throw new ConflictException(`Solo se cotiza un requerimiento ENVIADO (estado actual: ${fur.estado}); reabra la cotizacion si ya estaba cerrada`);
    }
    return fur;
  }

  private async validarProveedor(tx: Tx, idProveedor: number): Promise<void> {
    const q = sqlTag(this.sql);
    const [p] = await q.rows<{ ok: boolean }>({ ok: B }, tx)`
      SELECT ("tipoAnexo" = 'Proveedor') AS ok FROM anexos WHERE id = ${idProveedor}::int`;
    if (!p || !p.ok) throw new BadRequestException(`id_proveedor (${idProveedor}) no es un Anexo de tipo Proveedor`);
  }

  private async validarLineas(tx: Tx, idRequerimiento: number, lineas: CotizacionLineaDto[]): Promise<void> {
    const q = sqlTag(this.sql);
    const ids = lineas.map((l) => l.id_requerimiento_detalle);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay lineas repetidas en la cotizacion');
    const detalles = await q.rows<{ id: number; cantidad: string }>({ id: I, cantidad: T }, tx)`
      SELECT id, cantidad::text AS cantidad FROM requerimiento_detalle WHERE id_requerimiento = ${idRequerimiento}::int`;
    const solicitada = new Map(detalles.map((d) => [d.id, Number(d.cantidad)]));
    for (const l of lineas) {
      const max = solicitada.get(l.id_requerimiento_detalle);
      if (max === undefined) {
        throw new BadRequestException(`La linea ${l.id_requerimiento_detalle} no pertenece al requerimiento ${idRequerimiento}`);
      }
      if (l.cotiza === false) continue;
      if (Number(l.cantidad) <= 0) throw new BadRequestException(`La cantidad cotizada de la linea ${l.id_requerimiento_detalle} debe ser mayor a 0`);
      if (Number(l.cantidad) > max) {
        throw new BadRequestException(`La cantidad cotizada de la linea ${l.id_requerimiento_detalle} (${l.cantidad}) supera la solicitada (${max})`);
      }
    }
    if (lineas.every((l) => l.cotiza === false)) throw new BadRequestException('La cotizacion debe ofrecer al menos una linea');
  }

  private async insertarLineas(tx: Tx, idCotizacion: number, lineas: CotizacionLineaDto[]): Promise<void> {
    const q = sqlTag(this.sql);
    for (const l of lineas) {
      await q.run(tx)`
        INSERT INTO cotizacion_detalle (id_cotizacion, id_requerimiento_detalle, cotiza, cantidad, precio_unitario,
                                        plazo_entrega_dias, marca_modelo, observaciones)
        VALUES (${idCotizacion}::int, ${l.id_requerimiento_detalle}::int, ${l.cotiza ?? true}::boolean, ${l.cantidad}::numeric,
                ${l.precio_unitario}::numeric, CASE WHEN ${l.plazo_entrega_dias !== undefined}::boolean THEN ${l.plazo_entrega_dias ?? 0}::int END,
                NULLIF(${l.marca_modelo ?? ''}::text, ''), NULLIF(${l.observaciones ?? ''}::text, ''))`;
    }
  }

  /** Carga las cotizaciones del FUR con sus lineas y totales calculados. */
  private async cargar(idRequerimiento: number): Promise<CotizacionResponseDto[]> {
    const q = sqlTag(this.sql);
    const cabeceras = await q.rows<CabeceraRow>(CAB_SPEC)`
      SELECT c.id, c.numero::text AS numero, c.id_requerimiento, c.id_proveedor,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, c.fecha::text AS fecha, c.referencia::text AS referencia,
             c.moneda_id::text AS moneda_id, c.moneda_simbolo::text AS moneda_simbolo, c.incluye_igv, c.afecto_igv,
             c.forma_pago::text AS forma_pago, c.dias_credito, c.adelanto_porcentaje::text AS adelanto_porcentaje,
             c.medio_pago::text AS medio_pago, c.plazo_entrega_dias, c.validez_dias, c.garantia::text AS garantia,
             c.condiciones, c.archivo_url::text AS archivo_url
        FROM cotizacion c JOIN anexos a ON a.id = c.id_proveedor
       WHERE c.id_requerimiento = ${idRequerimiento}::int ORDER BY c.id`;
    if (cabeceras.length === 0) return [];

    const lineas = await q.rows<LineaRow>({
      id: I,
      id_cotizacion: I,
      id_requerimiento_detalle: I,
      codigo: T,
      descripcion: T,
      unidad: T,
      cotiza: B,
      cantidad: T,
      precio_unitario: T,
      plazo_entrega_dias: IN,
      marca_modelo: TN,
      observaciones: TN,
    })`
      SELECT x.id, x.id_cotizacion, x.id_requerimiento_detalle, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             COALESCE(u.simbolo, u.codigo)::text AS unidad, x.cotiza, x.cantidad::text AS cantidad,
             x.precio_unitario::text AS precio_unitario, x.plazo_entrega_dias, x.marca_modelo::text AS marca_modelo, x.observaciones
        FROM cotizacion_detalle x
        JOIN cotizacion c ON c.id = x.id_cotizacion
        JOIN requerimiento_detalle d ON d.id = x.id_requerimiento_detalle
        JOIN producto p ON p.id = d.id_producto
        JOIN unidad_medida u ON u.id = p.id_unidad_medida
       WHERE c.id_requerimiento = ${idRequerimiento}::int ORDER BY x.id_cotizacion, x.id_requerimiento_detalle`;

    const [ganadora] = await q.rows<{ id: number | null }>({ id: IN })`
      SELECT id_cotizacion_ganadora AS id FROM requerimiento WHERE id = ${idRequerimiento}::int`;

    return cabeceras.map((c) => {
      const propias = lineas.filter((l) => l.id_cotizacion === c.id);
      const tot = totalesCotizacion(
        propias.map((l) => ({ cotiza: l.cotiza, cantidad: Number(l.cantidad), precio: Number(l.precio_unitario) })),
        c.incluye_igv,
        c.afecto_igv,
      );
      const lineasResp: CotizacionLineaResponseDto[] = propias.map((l) => {
        const p = preciosOferta(Number(l.precio_unitario), c.incluye_igv, c.afecto_igv);
        return {
          id: l.id,
          id_requerimiento_detalle: l.id_requerimiento_detalle,
          codigo: l.codigo,
          descripcion: l.descripcion,
          unidad: l.unidad,
          cotiza: l.cotiza,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          precio_sin_igv: f4(p.sin),
          precio_con_igv: f4(p.con),
          subtotal_sin_igv: f2(l.cotiza ? Number(l.cantidad) * p.sin : 0),
          plazo_entrega_dias: l.plazo_entrega_dias,
          marca_modelo: l.marca_modelo,
          observaciones: l.observaciones,
        };
      });
      return {
        ...c,
        total_sin_igv: f2(tot.subtotal),
        igv: f2(tot.igv),
        total: f2(tot.total),
        es_ganadora: ganadora?.id === c.id,
        lineas: lineasResp,
      };
    });
  }
}
