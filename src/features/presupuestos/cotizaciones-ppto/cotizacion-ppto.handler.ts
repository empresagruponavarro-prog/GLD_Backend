import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { exigirTrabajadorVinculado, trabajadorDelUsuario } from '../../../platform/auth/usuarios/trabajador-del-usuario.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { preciosOferta, totalesCotizacion } from '../../requerimientos/shared/precios-oferta.js';
import { claveMoneda, tcVigente } from '../../tesoreria/shared/tipo-cambio.js';
import { esSoles, redondear } from '../../tesoreria/shared/tributos.js';
import {
  CreatePptoCotizacionDto,
  PptoCotizacionLineaResponseDto,
  PptoCotizacionResponseDto,
  PptoCuadroComparativoDto,
  PptoCuadroLineaDto,
  PptoCuadroProveedorDto,
  UpdatePptoCotizacionDto,
} from './cotizacion-ppto.dto.js';
import { ConciliarCompromisosService, type ResultadoConciliacion } from '../compromisos/conciliar-compromisos.service.js';
import { aplicarAdjudicacion, type CambioAdjudicacion } from './aplicar-adjudicacion.js';
import { cantidadCompleta, modoCotizacion, validarLineasCotizacion } from './adjudicacion.js';
import {
  bloquearPresupuesto,
  compromisosDeItems,
  estaCubierto,
  itemsDeSubpartida,
  leerPresupuesto,
  subpartidaPresupuesto,
  type CompromisoItem,
  type PresupuestoBloqueado,
} from './contexto-ppto.js';
import { ReprorrateoService } from './reprorrateo.service.js';

const f2 = (n: number) => redondear(n, 2).toFixed(2);
const f4 = (n: number) => redondear(n, 4).toFixed(4);

interface CabeceraRow {
  id: number;
  numero: string;
  id_presupuesto: number;
  id_detalle_fase: number;
  fase: string;
  id_detalle_categoria: number | null;
  subpartida: string | null;
  total_global: string | null;
  prorrateada: boolean;
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
  registrado_por: string | null;
}

const CAB_SPEC = {
  id: I,
  numero: T,
  id_presupuesto: I,
  id_detalle_fase: I,
  fase: T,
  id_detalle_categoria: IN,
  subpartida: TN,
  total_global: TN,
  prorrateada: B,
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
  registrado_por: TN,
} as const;

interface LineaRow {
  id: number;
  id_cotizacion: number;
  id_ppto_item: number;
  numero_item: string | null;
  id_subfase: number;
  subfase: string;
  codigo: string;
  descripcion: string;
  unidad: string;
  cotiza: boolean;
  cantidad: string;
  cantidad_item: string;
  precio_unitario: string;
  plazo_entrega_dias: number | null;
  marca_modelo: string | null;
  observaciones: string | null;
  adjudicada: boolean;
}

const LINEA_SPEC = {
  id: I,
  id_cotizacion: I,
  id_ppto_item: I,
  numero_item: TN,
  id_subfase: I,
  subfase: T,
  codigo: T,
  descripcion: T,
  unidad: T,
  cotiza: B,
  cantidad: T,
  cantidad_item: T,
  precio_unitario: T,
  plazo_entrega_dias: IN,
  marca_modelo: TN,
  observaciones: TN,
  adjudicada: B,
} as const;

type Cotizacion = PptoCotizacionResponseDto;

/** Filtros de lectura; 0 = sin filtrar. */
interface FiltroCotizaciones {
  idFase?: number;
  idSubpartida?: number;
  idCot?: number;
}

/**
 * Cotizaciones de proveedores por subpartida del presupuesto Meta (plan 09, cotización a nivel de subpartida). El proveedor da UN
 * total por toda la subpartida y el sistema lo prorratea entre sus ítems según el costo Meta: la cotización guarda una línea por
 * ítem (calculada), así el FUR, las órdenes y el Comercial siguen trabajando por ítem. Una cotización por (subpartida, proveedor)
 * y un solo ganador por subpartida. Toda escritura bloquea el presupuesto (`FOR UPDATE`) y la respuesta se arma **después del commit**.
 */
@Injectable()
export class CotizacionPptoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
    private readonly conciliacion: ConciliarCompromisosService,
    private readonly reprorrateo: ReprorrateoService,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(idPresupuesto: number, idFase?: number, idSubpartida?: number): Promise<Cotizacion[]> {
    await leerPresupuesto(this.sql, idPresupuesto);
    return this.cargar(idPresupuesto, { idFase, idSubpartida });
  }

  async getById(idPresupuesto: number, id: number): Promise<Cotizacion> {
    await leerPresupuesto(this.sql, idPresupuesto);
    const [cot] = await this.cargar(idPresupuesto, { idCot: id });
    if (!cot) throw new NotFoundException(`Cotización ${id} no encontrada en el presupuesto ${idPresupuesto}`);
    return cot;
  }

  /** Un total por proveedor y su desglose por ítem para elegir al ganador de la subpartida; no sugiere ninguno (igual que el cuadro de un FUR). */
  async cuadroComparativo(idPresupuesto: number, idSubpartida: number): Promise<PptoCuadroComparativoDto> {
    const ppto = await leerPresupuesto(this.sql, idPresupuesto);
    const sub = await subpartidaPresupuesto(this.sql, ppto.codigo, idSubpartida);
    const items = await itemsDeSubpartida(this.sql, ppto.codigo, sub.id);
    const cotizaciones = await this.cargar(idPresupuesto, { idSubpartida: sub.id });
    const compromisos = await compromisosDeItems(
      this.sql,
      items.map((i) => i.id),
    );

    // Ganadores: `id_cot_detalle` -> cotización dueña de esa línea.
    const cotDeLinea = new Map<number, number>();
    for (const c of cotizaciones) for (const l of c.lineas) cotDeLinea.set(l.id, c.id);
    const ganados = new Map<number, number>();

    const lineas: PptoCuadroLineaDto[] = items.map((i) => {
      const cant = Number(i.cantidad);
      const ofertas = cotizaciones.flatMap((c) =>
        c.lineas
          .filter((x) => x.id_ppto_item === i.id)
          .map((x) => ({
            id_cotizacion: c.id,
            id_cot_detalle: x.id,
            cotiza: x.cotiza,
            cantidad: x.cantidad,
            precio_sin_igv: x.precio_sin_igv,
            precio_con_igv: x.precio_con_igv,
            subtotal_sin_igv: x.subtotal_sin_igv,
            plazo_entrega_dias: x.plazo_entrega_dias ?? c.plazo_entrega_dias,
            cantidad_completa: x.cotiza && cantidadCompleta(Number(x.cantidad), cant),
          })),
      );
      const ganadora = ofertas.find((o) => o.id_cot_detalle === i.id_cot_detalle_ganadora);
      const idCotizacionGanadora = i.id_cot_detalle_ganadora === null ? null : (cotDeLinea.get(i.id_cot_detalle_ganadora) ?? null);
      if (idCotizacionGanadora !== null) ganados.set(idCotizacionGanadora, (ganados.get(idCotizacionGanadora) ?? 0) + 1);
      const compromiso = compromisos.get(i.id);
      return {
        id_ppto_item: i.id,
        numero_item: i.numero,
        id_subfase: i.id_subfase,
        subfase: i.subfase,
        codigo: i.codigo,
        descripcion: i.descripcion,
        unidad: i.unidad,
        cantidad: i.cantidad,
        costo_unitario_meta: i.costo_unitario,
        costo_total_meta: i.costo_total,
        id_cot_detalle_ganadora: i.id_cot_detalle_ganadora,
        id_cotizacion_ganadora: idCotizacionGanadora,
        adjudicado_por: i.adjudicado_por,
        fecha_adjudicacion: i.fecha_adjudicacion,
        comentario_adjudicacion: i.comentario_adjudicacion,
        cantidad_distinta: ganadora !== undefined && !cantidadCompleta(Number(ganadora.cantidad), cant),
        cubierto: estaCubierto(compromiso),
        compromiso: compromiso ? aCompromisoDto(compromiso) : null,
        ofertas,
      };
    });

    // El ganador de la subpartida es la cotización que más ítems gana (siempre es una sola: se adjudica completa).
    let idGanadora: number | null = null;
    for (const [idCot, n] of ganados) if (idGanadora === null || n > (ganados.get(idGanadora) ?? 0)) idGanadora = idCot;

    const proveedores: PptoCuadroProveedorDto[] = [];
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
        items_ganados: ganados.get(c.id) ?? 0,
        es_ganadora: idGanadora === c.id,
        total_global: c.total_global,
      });
    }

    return {
      id_presupuesto: ppto.id,
      codigo_presupuesto: ppto.codigo,
      estado: ppto.estado,
      id_detalle_categoria: sub.id,
      subpartida: sub.nombre,
      id_detalle_fase: sub.id_detalle_fase,
      fase: sub.fase,
      items_total: items.length,
      items_adjudicados: items.filter((i) => i.id_cot_detalle_ganadora !== null).length,
      id_cotizacion_ganadora: idGanadora,
      lineas,
      proveedores,
    };
  }

  // -------------------------------------------------------------- escritura

  async create(idPresupuesto: number, dto: CreatePptoCotizacionDto, user?: AuthUser): Promise<Cotizacion> {
    const quien = user?.usuario ?? 'SISTEMA';
    const { id, compromisos } = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const ppto = await bloquearPresupuesto(this.sql, tx, idPresupuesto);
      const modo = modoCotizacion(ppto.estado);
      await this.validarProveedor(tx, dto.id_proveedor);
      const sub = await subpartidaPresupuesto(this.sql, ppto.codigo, dto.id_detalle_categoria, tx);
      const [dup] = await q.rows<{ id: number }>({ id: I }, tx)`
        SELECT id FROM ppto_cotizacion WHERE id_detalle_categoria = ${sub.id}::int AND id_proveedor = ${dto.id_proveedor}::int`;
      if (dup) throw new ConflictException('Ese proveedor ya tiene una cotización en esta subpartida; edite la existente');
      const { items, lineas } = await this.reprorrateo.prorratear(tx, ppto, sub.id, dto.total);
      validarLineasCotizacion(lineas, items, modo);

      const numero = await this.ledger.siguienteNumero(tx, 'COT');
      const [cot] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO ppto_cotizacion (numero, id_presupuesto, id_detalle_fase, id_detalle_categoria, total_global, prorrateada, id_proveedor, fecha,
                                     referencia, moneda_id, moneda_simbolo, incluye_igv, afecto_igv, forma_pago, dias_credito, adelanto_porcentaje,
                                     medio_pago, plazo_entrega_dias, validez_dias, garantia, condiciones, archivo_url, registrado_por)
        VALUES (${numero}::text, ${idPresupuesto}::int, ${sub.id_detalle_fase}::int, ${sub.id}::int, ${dto.total}::numeric, true,
                ${dto.id_proveedor}::int, ${dto.fecha}::date,
                NULLIF(${dto.referencia ?? ''}::text, ''), ${dto.moneda_id}::text, NULLIF(${dto.moneda_simbolo ?? ''}::text, ''),
                ${dto.incluye_igv ?? false}::boolean, ${dto.afecto_igv ?? true}::boolean, ${dto.forma_pago}::text,
                ${dto.dias_credito ?? 0}::int, CASE WHEN ${dto.adelanto_porcentaje !== undefined}::boolean THEN ${dto.adelanto_porcentaje ?? '0'}::numeric END,
                NULLIF(${dto.medio_pago ?? ''}::text, ''), CASE WHEN ${dto.plazo_entrega_dias !== undefined}::boolean THEN ${dto.plazo_entrega_dias ?? 0}::int END,
                CASE WHEN ${dto.validez_dias !== undefined}::boolean THEN ${dto.validez_dias ?? 0}::int END,
                NULLIF(${dto.garantia ?? ''}::text, ''), NULLIF(${dto.condiciones ?? ''}::text, ''), NULLIF(${dto.archivo_url ?? ''}::text, ''),
                ${quien}::text)
        RETURNING id`;
      for (const l of lineas) await this.reprorrateo.insertarLinea(tx, cot.id, l);

      await this.aplicarMarcaDeAdjudicacion(tx, ppto, cot.id, dto.adjudicar, user, dto.comentario_adjudicacion ?? null);
      return { id: cot.id, compromisos: await this.conciliacion.conciliar(tx, ppto, user) };
    });
    return { ...(await this.getById(idPresupuesto, id)), compromisos };
  }

  async update(idPresupuesto: number, id: number, dto: UpdatePptoCotizacionDto, user?: AuthUser): Promise<Cotizacion> {
    const compromisos = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const ppto = await bloquearPresupuesto(this.sql, tx, idPresupuesto);
      const modo = modoCotizacion(ppto.estado);
      const [actual] = await q.rows<{ id: number; id_proveedor: number; id_detalle_categoria: number | null }>(
        { id: I, id_proveedor: I, id_detalle_categoria: IN },
        tx,
      )`
        SELECT id, id_proveedor, id_detalle_categoria FROM ppto_cotizacion
         WHERE id = ${id}::int AND id_presupuesto = ${idPresupuesto}::int FOR UPDATE`;
      if (!actual) throw new NotFoundException(`Cotización ${id} no encontrada en el presupuesto ${idPresupuesto}`);
      if (actual.id_detalle_categoria === null) {
        throw new ConflictException('Esta cotización es del modelo anterior (por ítem): elimínela y regístrela de nuevo por subpartida');
      }
      await this.exigirNoProtegida(tx, id, 'editar');
      if ((dto.incluye_igv !== undefined || dto.afecto_igv !== undefined) && dto.total === undefined) {
        throw new BadRequestException('Al cambiar el IGV vuelva a enviar el total: cambia lo que significa');
      }

      if (dto.id_proveedor !== undefined && dto.id_proveedor !== actual.id_proveedor) {
        await this.validarProveedor(tx, dto.id_proveedor);
        const [dup] = await q.rows<{ id: number }>({ id: I }, tx)`
          SELECT id FROM ppto_cotizacion WHERE id_detalle_categoria = ${actual.id_detalle_categoria}::int AND id_proveedor = ${dto.id_proveedor}::int`;
        if (dup) throw new ConflictException('Ese proveedor ya tiene una cotización en esta subpartida');
      }
      const prorrateo = dto.total !== undefined ? await this.reprorrateo.prorratear(tx, ppto, actual.id_detalle_categoria, dto.total) : null;
      if (prorrateo) validarLineasCotizacion(prorrateo.lineas, prorrateo.items, modo);

      await q.run(tx)`
        UPDATE ppto_cotizacion SET
          id_proveedor = CASE WHEN ${dto.id_proveedor !== undefined}::boolean THEN ${dto.id_proveedor ?? 0}::int ELSE id_proveedor END,
          total_global = CASE WHEN ${dto.total !== undefined}::boolean THEN ${dto.total ?? '0'}::numeric ELSE total_global END,
          prorrateada = CASE WHEN ${dto.total !== undefined}::boolean THEN true ELSE prorrateada END,
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

      if (prorrateo) await this.reprorrateo.reemplazarLineas(tx, id, prorrateo.lineas, prorrateo.items);
      await this.aplicarMarcaDeAdjudicacion(tx, ppto, id, dto.adjudicar, user, dto.comentario_adjudicacion ?? null);
      // Si ya ganaba la subpartida y al volver a prorratear entró un ítem nuevo, la gana completa (nunca queda a medias).
      if (prorrateo && dto.adjudicar === undefined) await this.reprorrateo.completarGanadora(tx, ppto, id, user);
      // Cambiar el total o las condiciones de la cotización ganadora también actualiza el FUR y sus órdenes provisionales.
      return this.conciliacion.conciliar(tx, ppto, user);
    });
    return { ...(await this.getById(idPresupuesto, id)), compromisos };
  }

  async delete(idPresupuesto: number, id: number, user?: AuthUser): Promise<{ deleted: boolean; id: number; compromisos: ResultadoConciliacion }> {
    const compromisos = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const ppto = await bloquearPresupuesto(this.sql, tx, idPresupuesto);
      modoCotizacion(ppto.estado);
      const [cot] = await q.rows<{ id: number }>({ id: I }, tx)`
        SELECT id FROM ppto_cotizacion WHERE id = ${id}::int AND id_presupuesto = ${idPresupuesto}::int FOR UPDATE`;
      if (!cot) throw new NotFoundException(`Cotización ${id} no encontrada en el presupuesto ${idPresupuesto}`);
      await this.exigirNoProtegida(tx, id, 'eliminar');
      const lineas = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${id}::int`;
      await this.reprorrateo.soltarGanadorDeLineas(
        tx,
        lineas.map((l) => l.id),
      );
      await q.run(tx)`DELETE FROM ppto_cotizacion WHERE id = ${id}::int`;
      return this.conciliacion.conciliar(tx, ppto, user);
    });
    return { deleted: true, id, compromisos };
  }

  // ---------------------------------------------------------------- privado

  private async validarProveedor(tx: Tx, idProveedor: number): Promise<void> {
    const q = sqlTag(this.sql);
    const [p] = await q.rows<{ ok: boolean }>({ ok: B }, tx)`
      SELECT ("tipoAnexo" = 'Proveedor') AS ok FROM anexos WHERE id = ${idProveedor}::int`;
    if (!p || !p.ok) throw new BadRequestException(`id_proveedor (${idProveedor}) no es un Anexo de tipo Proveedor`);
  }

  /** Una cotización que cubre un ítem con orden registrada es evidencia de esa compra: no se edita ni se elimina. */
  private async exigirNoProtegida(tx: Tx, idCotizacion: number, accion: string): Promise<void> {
    const { cubiertos, documentos } = await this.reprorrateo.itemsCubiertosDeCotizacion(tx, idCotizacion);
    if (cubiertos > 0) {
      throw new ConflictException(
        `No se puede ${accion} la cotización: ${cubiertos} de sus ítems ya tienen una orden registrada (${documentos.join(', ')}). Anule la orden primero`,
      );
    }
  }
  /**
   * Marca «Adjudicar» de la cotización: `true` = este proveedor gana la subpartida completa (todos sus ítems que cotiza);
   * `false` = si era el ganador, la suelta. Sin valor, no cambia nada. Gana quien pide adjudicar, y solo si tiene un
   * trabajador vinculado (D-9).
   */
  private async aplicarMarcaDeAdjudicacion(
    tx: Tx,
    ppto: PresupuestoBloqueado,
    idCotizacion: number,
    adjudicar: boolean | undefined,
    user: AuthUser | undefined,
    comentario: string | null,
  ): Promise<void> {
    if (adjudicar === undefined) return;
    const q = sqlTag(this.sql);
    const lineas = await q.rows<{ id: number; id_ppto_item: number; cotiza: boolean }>({ id: I, id_ppto_item: I, cotiza: B }, tx)`
      SELECT id, id_ppto_item, cotiza FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${idCotizacion}::int ORDER BY id`;

    const cambios: CambioAdjudicacion[] = [];
    if (adjudicar) {
      for (const l of lineas) if (l.cotiza) cambios.push({ idItem: l.id_ppto_item, idCotDetalle: l.id });
      if (cambios.length === 0) throw new BadRequestException('La cotización no ofrece ningún ítem: no se puede adjudicar');
      if (user) await trabajadorDelUsuario(tx.orm.public, user.id, user.usuario);
      else exigirTrabajadorVinculado(null, '(sin sesión)');
    } else {
      const ganaba = await q.rows<{ id: number }>({ id: I }, tx)`
        SELECT id FROM "ppto_DetalleItems"
         WHERE id_ppto_cot_detalle_ganadora = ANY(string_to_array(${csv(lineas.map((l) => l.id)) || '0'}::text, ',')::int[])`;
      for (const g of ganaba) cambios.push({ idItem: g.id, idCotDetalle: null });
    }
    await aplicarAdjudicacion(this.sql, tx, { presupuesto: ppto, cambios, usuario: user?.usuario ?? 'SISTEMA', comentario });
  }

  /** Cotizaciones (con sus líneas y totales) de un presupuesto, filtradas por fase, subpartida o cotización. */
  private async cargar(idPresupuesto: number, filtro: FiltroCotizaciones): Promise<Cotizacion[]> {
    const idFase = filtro.idFase ?? 0;
    const idSub = filtro.idSubpartida ?? 0;
    const idCot = filtro.idCot ?? 0;
    const q = sqlTag(this.sql);
    const cabeceras = await q.rows<CabeceraRow>(CAB_SPEC)`
      SELECT c.id, c.numero::text AS numero, c.id_presupuesto, c.id_detalle_fase,
             COALESCE(m."FaseProyecto", f."IdpptoFase", 'Fase #' || f.id::text)::text AS fase,
             c.id_detalle_categoria,
             COALESCE((SELECT fc."Descripcion" FROM "ppto_FasesCategorias" fc WHERE fc."IdpptoFaseCategoria" = sc."IdpptoFaseCategoria" LIMIT 1),
                      'Subpartida #' || sc.id::text)::text AS subpartida,
             c.total_global::text AS total_global, c.prorrateada, c.id_proveedor,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, c.fecha::text AS fecha, c.referencia::text AS referencia,
             c.moneda_id::text AS moneda_id, c.moneda_simbolo::text AS moneda_simbolo, c.incluye_igv, c.afecto_igv,
             c.forma_pago::text AS forma_pago, c.dias_credito, c.adelanto_porcentaje::text AS adelanto_porcentaje,
             c.medio_pago::text AS medio_pago, c.plazo_entrega_dias, c.validez_dias, c.garantia::text AS garantia,
             c.condiciones, c.archivo_url::text AS archivo_url, c.registrado_por::text AS registrado_por
        FROM ppto_cotizacion c
        JOIN anexos a ON a.id = c.id_proveedor
        JOIN "ppto_DetalleFases" f ON f.id = c.id_detalle_fase
        LEFT JOIN "ppto_DetalleFasesCate" sc ON sc.id = c.id_detalle_categoria
        LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = f."IdpptoFase"
       WHERE c.id_presupuesto = ${idPresupuesto}::int AND (${idFase}::int = 0 OR c.id_detalle_fase = ${idFase}::int)
         AND (${idSub}::int = 0 OR c.id_detalle_categoria = ${idSub}::int)
         AND (${idCot}::int = 0 OR c.id = ${idCot}::int)
       ORDER BY c.id_detalle_fase, c.id_detalle_categoria, c.id`;
    if (cabeceras.length === 0) return [];

    const lineas = await q.rows<LineaRow>(LINEA_SPEC)`
      SELECT x.id, x.id_cotizacion, x.id_ppto_item, i."Item"::text AS numero_item, fc.id AS id_subfase,
             COALESCE((SELECT m."Descripcion" FROM "ppto_FasesCategorias" m WHERE m."IdpptoFaseCategoria" = fc."IdpptoFaseCategoria" LIMIT 1),
                      'Subfase #' || fc.id::text)::text AS subfase,
             p.codigo::text AS codigo, p.descripcion::text AS descripcion, COALESCE(u.simbolo, u.codigo)::text AS unidad,
             x.cotiza, x.cantidad::text AS cantidad, i."Cantidad"::text AS cantidad_item, x.precio_unitario::text AS precio_unitario,
             x.plazo_entrega_dias, x.marca_modelo::text AS marca_modelo, x.observaciones,
             COALESCE(i.id_ppto_cot_detalle_ganadora = x.id, false) AS adjudicada
        FROM ppto_cotizacion_detalle x
        JOIN ppto_cotizacion c ON c.id = x.id_cotizacion
        JOIN "ppto_DetalleItems" i ON i.id = x.id_ppto_item
        JOIN "ppto_DetalleFasesCate" fc ON fc.id = i.id_detalle_categoria
        JOIN producto p ON p.id = i.id_producto
        JOIN unidad_medida u ON u.id = i.id_unidad_medida
       WHERE c.id_presupuesto = ${idPresupuesto}::int AND (${idFase}::int = 0 OR c.id_detalle_fase = ${idFase}::int)
         AND (${idSub}::int = 0 OR c.id_detalle_categoria = ${idSub}::int)
         AND (${idCot}::int = 0 OR c.id = ${idCot}::int)
       ORDER BY x.id_cotizacion, fc.id, i."Orden", x.id_ppto_item`;

    const compromisos = await compromisosDeItems(
      this.sql,
      [...new Set(lineas.map((l) => l.id_ppto_item))],
    );

    return cabeceras.map((c) => {
      const propias = lineas.filter((l) => l.id_cotizacion === c.id);
      const tot = totalesCotizacion(
        propias.map((l) => ({ cotiza: l.cotiza, cantidad: Number(l.cantidad), precio: Number(l.precio_unitario) })),
        c.incluye_igv,
        c.afecto_igv,
      );
      const lineasResp: PptoCotizacionLineaResponseDto[] = propias.map((l) => {
        const p = preciosOferta(Number(l.precio_unitario), c.incluye_igv, c.afecto_igv);
        return {
          id: l.id,
          id_ppto_item: l.id_ppto_item,
          numero_item: l.numero_item,
          id_subfase: l.id_subfase,
          subfase: l.subfase,
          codigo: l.codigo,
          descripcion: l.descripcion,
          unidad: l.unidad,
          cotiza: l.cotiza,
          cantidad: l.cantidad,
          cantidad_item: l.cantidad_item,
          cantidad_distinta: l.cotiza && !cantidadCompleta(Number(l.cantidad), Number(l.cantidad_item)),
          precio_unitario: l.precio_unitario,
          precio_sin_igv: f4(p.sin),
          precio_con_igv: f4(p.con),
          subtotal_sin_igv: f2(l.cotiza ? Number(l.cantidad) * p.sin : 0),
          plazo_entrega_dias: l.plazo_entrega_dias,
          marca_modelo: l.marca_modelo,
          observaciones: l.observaciones,
          adjudicada: l.adjudicada,
        };
      });
      return {
        ...c,
        total_sin_igv: f2(tot.subtotal),
        igv: f2(tot.igv),
        total: f2(tot.total),
        items_adjudicados: lineasResp.filter((l) => l.adjudicada).length,
        protegida: propias.some((l) => estaCubierto(compromisos.get(l.id_ppto_item))),
        lineas: lineasResp,
      };
    });
  }
}

function aCompromisoDto(c: CompromisoItem) {
  return {
    id_requerimiento: c.id_requerimiento,
    numero_requerimiento: c.numero_requerimiento,
    estado_requerimiento: c.estado_requerimiento,
    id_documento: c.id_documento,
    numero_documento: c.numero_documento,
    estado_documento: c.estado_documento,
  };
}
