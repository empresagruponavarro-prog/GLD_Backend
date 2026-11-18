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
  PptoCotizacionLineaDto,
  PptoCotizacionLineaResponseDto,
  PptoCotizacionResponseDto,
  PptoCuadroComparativoDto,
  PptoCuadroLineaDto,
  PptoCuadroProveedorDto,
  UpdatePptoCotizacionDto,
} from './cotizacion-ppto.dto.js';
import { ConciliarCompromisosService, type ResultadoConciliacion } from '../compromisos/conciliar-compromisos.service.js';
import { aplicarAdjudicacion, type CambioAdjudicacion } from './aplicar-adjudicacion.js';
import {
  cantidadCompleta,
  modoCotizacion,
  sigueSiendoGanadora,
  validarLineasCotizacion,
  type ItemFase,
} from './adjudicacion.js';
import {
  bloquearPresupuesto,
  compromisosDeItems,
  estaCubierto,
  fasePresupuesto,
  itemsDeFase,
  leerPresupuesto,
  type CompromisoItem,
  type PresupuestoBloqueado,
} from './contexto-ppto.js';

const f2 = (n: number) => redondear(n, 2).toFixed(2);
const f4 = (n: number) => redondear(n, 4).toFixed(4);

interface CabeceraRow {
  id: number;
  numero: string;
  id_presupuesto: number;
  id_detalle_fase: number;
  fase: string;
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

/**
 * Cotizaciones de proveedores por ítem del presupuesto Meta (plan 09, lámina 5). Una cotización por (fase, proveedor) con
 * una línea por ítem. Toda escritura bloquea el presupuesto (`FOR UPDATE`) y la respuesta se arma **después del commit**.
 */
@Injectable()
export class CotizacionPptoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
    private readonly conciliacion: ConciliarCompromisosService,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(idPresupuesto: number, idFase?: number): Promise<Cotizacion[]> {
    await leerPresupuesto(this.sql, idPresupuesto);
    return this.cargar(idPresupuesto, idFase ?? 0, 0);
  }

  async getById(idPresupuesto: number, id: number): Promise<Cotizacion> {
    await leerPresupuesto(this.sql, idPresupuesto);
    const [cot] = await this.cargar(idPresupuesto, 0, id);
    if (!cot) throw new NotFoundException(`Cotización ${id} no encontrada en el presupuesto ${idPresupuesto}`);
    return cot;
  }

  /** Matriz ítem × proveedor de una fase para elegir ganadores; no sugiere ninguno (igual que el cuadro de un FUR). */
  async cuadroComparativo(idPresupuesto: number, idFase: number): Promise<PptoCuadroComparativoDto> {
    const ppto = await leerPresupuesto(this.sql, idPresupuesto);
    const fase = await fasePresupuesto(this.sql, ppto.codigo, idFase);
    const items = await itemsDeFase(this.sql, ppto.codigo, idFase);
    const cotizaciones = await this.cargar(idPresupuesto, idFase, 0);
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
      });
    }

    return {
      id_presupuesto: ppto.id,
      codigo_presupuesto: ppto.codigo,
      estado: ppto.estado,
      id_detalle_fase: fase.id,
      fase: fase.nombre,
      items_total: items.length,
      items_adjudicados: items.filter((i) => i.id_cot_detalle_ganadora !== null).length,
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
      const fase = await fasePresupuesto(this.sql, ppto.codigo, dto.id_detalle_fase, tx);
      const [dup] = await q.rows<{ id: number }>({ id: I }, tx)`
        SELECT id FROM ppto_cotizacion WHERE id_detalle_fase = ${dto.id_detalle_fase}::int AND id_proveedor = ${dto.id_proveedor}::int`;
      if (dup) throw new ConflictException('Ese proveedor ya tiene una cotización en esta fase; edite la existente');
      const items = await this.itemsParaValidar(tx, ppto, fase.id);
      validarLineasCotizacion(dto.lineas, items, modo);

      const numero = await this.ledger.siguienteNumero(tx, 'COT');
      const [cot] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO ppto_cotizacion (numero, id_presupuesto, id_detalle_fase, id_proveedor, fecha, referencia, moneda_id, moneda_simbolo,
                                     incluye_igv, afecto_igv, forma_pago, dias_credito, adelanto_porcentaje, medio_pago,
                                     plazo_entrega_dias, validez_dias, garantia, condiciones, archivo_url, registrado_por)
        VALUES (${numero}::text, ${idPresupuesto}::int, ${dto.id_detalle_fase}::int, ${dto.id_proveedor}::int, ${dto.fecha}::date,
                NULLIF(${dto.referencia ?? ''}::text, ''), ${dto.moneda_id}::text, NULLIF(${dto.moneda_simbolo ?? ''}::text, ''),
                ${dto.incluye_igv ?? false}::boolean, ${dto.afecto_igv ?? true}::boolean, ${dto.forma_pago}::text,
                ${dto.dias_credito ?? 0}::int, CASE WHEN ${dto.adelanto_porcentaje !== undefined}::boolean THEN ${dto.adelanto_porcentaje ?? '0'}::numeric END,
                NULLIF(${dto.medio_pago ?? ''}::text, ''), CASE WHEN ${dto.plazo_entrega_dias !== undefined}::boolean THEN ${dto.plazo_entrega_dias ?? 0}::int END,
                CASE WHEN ${dto.validez_dias !== undefined}::boolean THEN ${dto.validez_dias ?? 0}::int END,
                NULLIF(${dto.garantia ?? ''}::text, ''), NULLIF(${dto.condiciones ?? ''}::text, ''), NULLIF(${dto.archivo_url ?? ''}::text, ''),
                ${quien}::text)
        RETURNING id`;
      const lineaPorItem = new Map<number, number>();
      for (const l of dto.lineas) lineaPorItem.set(l.id_ppto_item, await this.insertarLinea(tx, cot.id, l));

      await this.aplicarMarcasDeAdjudicacion(tx, ppto, dto.lineas, lineaPorItem, user, dto.comentario_adjudicacion ?? null);
      return { id: cot.id, compromisos: await this.conciliacion.conciliar(tx, ppto, user) };
    });
    return { ...(await this.getById(idPresupuesto, id)), compromisos };
  }

  async update(idPresupuesto: number, id: number, dto: UpdatePptoCotizacionDto, user?: AuthUser): Promise<Cotizacion> {
    const compromisos = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const ppto = await bloquearPresupuesto(this.sql, tx, idPresupuesto);
      const modo = modoCotizacion(ppto.estado);
      const [actual] = await q.rows<{ id: number; id_proveedor: number; id_detalle_fase: number }>(
        { id: I, id_proveedor: I, id_detalle_fase: I },
        tx,
      )`
        SELECT id, id_proveedor, id_detalle_fase FROM ppto_cotizacion
         WHERE id = ${id}::int AND id_presupuesto = ${idPresupuesto}::int FOR UPDATE`;
      if (!actual) throw new NotFoundException(`Cotización ${id} no encontrada en el presupuesto ${idPresupuesto}`);
      await this.exigirNoProtegida(tx, id, 'editar');

      if (dto.id_proveedor !== undefined && dto.id_proveedor !== actual.id_proveedor) {
        await this.validarProveedor(tx, dto.id_proveedor);
        const [dup] = await q.rows<{ id: number }>({ id: I }, tx)`
          SELECT id FROM ppto_cotizacion WHERE id_detalle_fase = ${actual.id_detalle_fase}::int AND id_proveedor = ${dto.id_proveedor}::int`;
        if (dup) throw new ConflictException('Ese proveedor ya tiene una cotización en esta fase');
      }
      const items = dto.lineas ? await this.itemsParaValidar(tx, ppto, actual.id_detalle_fase) : null;
      if (dto.lineas && items) validarLineasCotizacion(dto.lineas, items, modo);

      await q.run(tx)`
        UPDATE ppto_cotizacion SET
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

      if (dto.lineas && items) {
        const lineaPorItem = await this.reemplazarLineas(tx, id, dto.lineas, items);
        await this.aplicarMarcasDeAdjudicacion(tx, ppto, dto.lineas, lineaPorItem, user, dto.comentario_adjudicacion ?? null);
      }
      // Cambiar precios o condiciones de la cotización ganadora también actualiza el FUR y sus órdenes provisionales.
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
      await this.soltarGanadorDeLineas(
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

  /** Ítems de la fase con su cantidad y si ya tienen una orden registrada. */
  private async itemsParaValidar(tx: Tx, ppto: PresupuestoBloqueado, idFase: number): Promise<Map<number, ItemFase>> {
    const items = await itemsDeFase(this.sql, ppto.codigo, idFase, tx);
    const compromisos = await compromisosDeItems(
      this.sql,
      items.map((i) => i.id),
      tx,
    );
    return new Map(
      items.map((i) => [i.id, { id: i.id, cantidad: Number(i.cantidad), cubierto: estaCubierto(compromisos.get(i.id)), etiqueta: i.codigo }]),
    );
  }

  /** Una cotización que cubre un ítem con orden registrada es evidencia de esa compra: no se edita ni se elimina. */
  private async exigirNoProtegida(tx: Tx, idCotizacion: number, accion: string): Promise<void> {
    const q = sqlTag(this.sql);
    const items = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id_ppto_item AS id FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${idCotizacion}::int`;
    const compromisos = await compromisosDeItems(
      this.sql,
      items.map((i) => i.id),
      tx,
    );
    const cubiertos = items.filter((i) => estaCubierto(compromisos.get(i.id)));
    if (cubiertos.length > 0) {
      const docs = [...new Set(cubiertos.map((i) => compromisos.get(i.id)?.numero_documento).filter((n): n is string => !!n))];
      throw new ConflictException(
        `No se puede ${accion} la cotización: ${cubiertos.length} de sus ítems ya tienen una orden registrada (${docs.join(', ')}). Anule la orden primero`,
      );
    }
  }

  private async insertarLinea(tx: Tx, idCotizacion: number, l: PptoCotizacionLineaDto): Promise<number> {
    const q = sqlTag(this.sql);
    const [fila] = await q.rows<{ id: number }>({ id: I }, tx)`
      INSERT INTO ppto_cotizacion_detalle (id_cotizacion, id_ppto_item, cotiza, cantidad, precio_unitario, plazo_entrega_dias,
                                           marca_modelo, observaciones)
      VALUES (${idCotizacion}::int, ${l.id_ppto_item}::int, ${l.cotiza ?? true}::boolean, ${l.cantidad}::numeric, ${l.precio_unitario}::numeric,
              CASE WHEN ${l.plazo_entrega_dias !== undefined}::boolean THEN ${l.plazo_entrega_dias ?? 0}::int END,
              NULLIF(${l.marca_modelo ?? ''}::text, ''), NULLIF(${l.observaciones ?? ''}::text, ''))
      RETURNING id`;
    return fila.id;
  }

  /**
   * Deja las líneas de la cotización como las manda el cliente **sin perder el ganador** de las que siguen:
   * actualiza las que ya estaban, agrega las nuevas y quita las que faltan (liberando su ítem). El ganador de una línea
   * que dejó de ofrecer la cantidad completa se suelta. Devuelve ítem -> línea.
   */
  private async reemplazarLineas(tx: Tx, idCotizacion: number, lineas: PptoCotizacionLineaDto[], items: Map<number, ItemFase>): Promise<Map<number, number>> {
    const q = sqlTag(this.sql);
    const existentes = await q.rows<{ id: number; id_ppto_item: number }>({ id: I, id_ppto_item: I }, tx)`
      SELECT id, id_ppto_item FROM ppto_cotizacion_detalle WHERE id_cotizacion = ${idCotizacion}::int`;
    const idLineaDeItem = new Map(existentes.map((e) => [e.id_ppto_item, e.id]));
    const nuevosItems = new Set(lineas.map((l) => l.id_ppto_item));

    // Las líneas que ya no vienen se quitan y sus ítems quedan sin ganador.
    const sobran = existentes.filter((e) => !nuevosItems.has(e.id_ppto_item)).map((e) => e.id);
    if (sobran.length > 0) {
      await this.soltarGanadorDeLineas(tx, sobran);
      await q.run(tx)`DELETE FROM ppto_cotizacion_detalle WHERE id = ANY(string_to_array(${csv(sobran)}::text, ',')::int[])`;
    }

    const resultado = new Map<number, number>();
    for (const l of lineas) {
      const idExistente = idLineaDeItem.get(l.id_ppto_item);
      if (idExistente === undefined) {
        resultado.set(l.id_ppto_item, await this.insertarLinea(tx, idCotizacion, l));
        continue;
      }
      await q.run(tx)`
        UPDATE ppto_cotizacion_detalle
           SET cotiza = ${l.cotiza ?? true}::boolean, cantidad = ${l.cantidad}::numeric, precio_unitario = ${l.precio_unitario}::numeric,
               plazo_entrega_dias = CASE WHEN ${l.plazo_entrega_dias !== undefined}::boolean THEN ${l.plazo_entrega_dias ?? 0}::int END,
               marca_modelo = NULLIF(${l.marca_modelo ?? ''}::text, ''), observaciones = NULLIF(${l.observaciones ?? ''}::text, '')
         WHERE id = ${idExistente}::int`;
      resultado.set(l.id_ppto_item, idExistente);

      // ¿Seguía ganando este ítem? Si ya no ofrece la cantidad completa, lo pierde.
      const item = items.get(l.id_ppto_item);
      if (item && !sigueSiendoGanadora({ cotiza: l.cotiza ?? true, cantidad: Number(l.cantidad) }, item.cantidad)) {
        await q.run(tx)`
          UPDATE "ppto_DetalleItems"
             SET id_ppto_cot_detalle_ganadora = NULL, adjudicado_por = NULL, fecha_adjudicacion = NULL, comentario_adjudicacion = NULL
           WHERE id = ${l.id_ppto_item}::int AND id_ppto_cot_detalle_ganadora = ${idExistente}::int`;
      }
    }
    return resultado;
  }

  /** Quita el ganador (y su trazabilidad) de los ítems cuyo ganador es alguna de estas líneas de cotización. */
  private async soltarGanadorDeLineas(tx: Tx, idsLinea: number[]): Promise<void> {
    if (idsLinea.length === 0) return;
    const q = sqlTag(this.sql);
    await q.run(tx)`
      UPDATE "ppto_DetalleItems"
         SET id_ppto_cot_detalle_ganadora = NULL, adjudicado_por = NULL, fecha_adjudicacion = NULL, comentario_adjudicacion = NULL
       WHERE id_ppto_cot_detalle_ganadora = ANY(string_to_array(${csv(idsLinea)}::text, ',')::int[])`;
  }

  /**
   * Marca de «Adjudicar» por línea (lámina 5): `true` = este proveedor gana el ítem; `false` = si era el ganador, lo suelta.
   * Gana quien pide adjudicar, y solo si tiene un trabajador vinculado (D-9).
   */
  private async aplicarMarcasDeAdjudicacion(
    tx: Tx,
    ppto: PresupuestoBloqueado,
    lineas: PptoCotizacionLineaDto[],
    lineaPorItem: Map<number, number>,
    user: AuthUser | undefined,
    comentario: string | null,
  ): Promise<void> {
    const quiere = lineas.filter((l) => l.adjudicar === true && l.cotiza !== false);
    const suelta = lineas.filter((l) => l.adjudicar === false);
    if (quiere.length === 0 && suelta.length === 0) return;

    const cambios: CambioAdjudicacion[] = quiere.map((l) => ({ idItem: l.id_ppto_item, idCotDetalle: lineaPorItem.get(l.id_ppto_item)! }));
    if (suelta.length > 0) {
      const q = sqlTag(this.sql);
      const lineasPropias = suelta.map((l) => lineaPorItem.get(l.id_ppto_item)).filter((x): x is number => x !== undefined);
      const ganaba =
        lineasPropias.length === 0
          ? []
          : await q.rows<{ id: number }>({ id: I }, tx)`
              SELECT id FROM "ppto_DetalleItems"
               WHERE id_ppto_cot_detalle_ganadora = ANY(string_to_array(${csv(lineasPropias)}::text, ',')::int[])`;
      for (const g of ganaba) cambios.push({ idItem: g.id, idCotDetalle: null });
    }

    if (quiere.length > 0) {
      if (user) await trabajadorDelUsuario(tx.orm.public, user.id, user.usuario);
      else exigirTrabajadorVinculado(null, '(sin sesión)');
    }
    await aplicarAdjudicacion(this.sql, tx, { presupuesto: ppto, cambios, usuario: user?.usuario ?? 'SISTEMA', comentario });
  }

  /** Cotizaciones (con sus líneas y totales) de un presupuesto; `idFase`/`idCot` en 0 = sin filtrar. */
  private async cargar(idPresupuesto: number, idFase: number, idCot: number): Promise<Cotizacion[]> {
    const q = sqlTag(this.sql);
    const cabeceras = await q.rows<CabeceraRow>(CAB_SPEC)`
      SELECT c.id, c.numero::text AS numero, c.id_presupuesto, c.id_detalle_fase,
             COALESCE(m."FaseProyecto", f."IdpptoFase", 'Fase #' || f.id::text)::text AS fase, c.id_proveedor,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, c.fecha::text AS fecha, c.referencia::text AS referencia,
             c.moneda_id::text AS moneda_id, c.moneda_simbolo::text AS moneda_simbolo, c.incluye_igv, c.afecto_igv,
             c.forma_pago::text AS forma_pago, c.dias_credito, c.adelanto_porcentaje::text AS adelanto_porcentaje,
             c.medio_pago::text AS medio_pago, c.plazo_entrega_dias, c.validez_dias, c.garantia::text AS garantia,
             c.condiciones, c.archivo_url::text AS archivo_url, c.registrado_por::text AS registrado_por
        FROM ppto_cotizacion c
        JOIN anexos a ON a.id = c.id_proveedor
        JOIN "ppto_DetalleFases" f ON f.id = c.id_detalle_fase
        LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = f."IdpptoFase"
       WHERE c.id_presupuesto = ${idPresupuesto}::int AND (${idFase}::int = 0 OR c.id_detalle_fase = ${idFase}::int)
         AND (${idCot}::int = 0 OR c.id = ${idCot}::int)
       ORDER BY c.id_detalle_fase, c.id`;
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
