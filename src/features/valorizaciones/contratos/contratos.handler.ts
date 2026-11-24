import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { hoyLima } from '../../operaciones-obra/shared/obra-shared.js';
import { altaContrato } from '../shared/alta-contrato.js';
import { condicionesDe } from '../shared/calculo.js';
import { calcularAdelanto, redondear2, repartirDeductivos } from '../shared/cuota.js';
import {
  aprobadasDelEsquema,
  bloquearContrato,
  garantiaRetenida,
  leerContrato,
  leerCuotas,
  leerDeductivos,
  leerDocumento,
  leerPagos,
  montosDe,
  tieneMovimientoDePago,
  type ContratoFila,
} from '../shared/datos.js';
import { armarCuentaCorriente, type Movimiento } from '../shared/cuenta-corriente.js';
import { marcarAplicados } from '../shared/deductivos-estado.js';
import { matrizDePagos } from '../shared/esquema.js';
import { imputarPagos } from '../shared/imputar-pagos.js';
import { cuotaJson, m2, sumarMeses } from '../shared/serializar.js';
import type { DevolverGarantiaDto, ListContratosQueryDto, UpdateContratoDto } from './contratos.dto.js';

/** Resumen de una fila de la lista de contratos. */
export interface ContratoResumen {
  id: number;
  id_documento_origen: number;
  numero_documento: string | null;
  proveedor: string | null;
  centro_costo: string | null;
  cliente: string | null;
  estado: string;
  moneda_simbolo: string | null;
  total: string;
  adelanto_porcentaje: string;
  garantia_porcentaje: string;
  numero_valorizaciones: number;
  valorizaciones_aprobadas: number;
  valorizado: string;
  garantia_retenida: string;
  pagado: string;
  visto_operaciones: boolean;
  visto_administracion: boolean;
  con_borrador: boolean;
}

const RESUMEN_SPEC = {
  id: I, id_documento_origen: I, numero_documento: TN, proveedor: TN, centro_costo: TN, cliente: TN, estado: T, moneda_simbolo: TN, total: T,
  adelanto_porcentaje: T, garantia_porcentaje: T, numero_valorizaciones: I, valorizaciones_aprobadas: I, valorizado: T, garantia_retenida: T, pagado: T,
  visto_operaciones: B, visto_administracion: B, con_borrador: B, total_filas: I,
} as const;

@Injectable()
export class ContratosHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  // ---------------------------------------------------------------- lectura

  async listar(query: ListContratosQueryDto): Promise<Paginated<ContratoResumen>> {
    const { page, pageSize, offset } = pageParams(query);
    const q = sqlTag(this.sql);
    const patron = `%${query.search ?? ''}%`;
    const estado = query.estado ?? '';
    const cc = query.id_centro_costo ?? 0;
    const anexo = query.id_anexo ?? 0;
    const filas = await q.rows<ContratoResumen & { total_filas: number }>(RESUMEN_SPEC)`
      SELECT c.id, c.id_documento_origen, COALESCE(o.numero_documento, o.numero_oc)::text AS numero_documento,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, cc.centro_costo::text AS centro_costo,
             COALESCE(cl."NombreComercial", cl."Anexo")::text AS cliente, c.estado::text AS estado, o.moneda_simbolo::text AS moneda_simbolo,
             COALESCE(o.total, 0)::text AS total, c.adelanto_porcentaje::text AS adelanto_porcentaje, c.garantia_porcentaje::text AS garantia_porcentaje,
             c.numero_valorizaciones,
             (SELECT count(*)::int FROM valorizacion v WHERE v.id_contrato = c.id AND v.estado::text = 'APROBADA' AND v.tipo::text = 'VALORIZACION') AS valorizaciones_aprobadas,
             COALESCE((SELECT SUM(v.valorizado) FROM valorizacion v WHERE v.id_contrato = c.id AND v.estado::text = 'APROBADA'), 0)::text AS valorizado,
             COALESCE((SELECT SUM(v.garantia) FROM valorizacion v WHERE v.id_contrato = c.id AND v.estado::text = 'APROBADA'), 0)::text AS garantia_retenida,
             COALESCE((SELECT SUM(p.monto) FROM pago p WHERE p.id_documento_origen = o.id AND p.estado::text = 'REGISTRADO' AND p.concepto::text = 'PROVEEDOR'), 0)::text AS pagado,
             (c.visto_operaciones_en IS NOT NULL) AS visto_operaciones, (c.visto_administracion_en IS NOT NULL) AS visto_administracion,
             EXISTS (SELECT 1 FROM valorizacion v WHERE v.id_contrato = c.id AND v.estado::text = 'BORRADOR' AND v.tipo::text = 'VALORIZACION') AS con_borrador,
             (count(*) OVER ())::int AS total_filas
        FROM contrato_valorizacion c
        JOIN "documentosOrigen" o ON o.id = c.id_documento_origen
        LEFT JOIN anexos a ON a.id = o.id_anexo
        LEFT JOIN "CentroCostos" cc ON cc.id = o.id_centro_costo
        LEFT JOIN anexos cl ON cl.id = cc.id_anexo
       WHERE (${estado}::text = '' OR c.estado::text = ${estado}::text)
         AND (${cc}::int = 0 OR o.id_centro_costo = ${cc}::int)
         AND (${anexo}::int = 0 OR o.id_anexo = ${anexo}::int)
         AND (${patron}::text = '%%' OR o.numero_documento ILIKE ${patron}::text OR o.numero_oc ILIKE ${patron}::text
              OR a."Anexo" ILIKE ${patron}::text OR a."NombreComercial" ILIKE ${patron}::text OR cc.centro_costo ILIKE ${patron}::text)
       ORDER BY c.id DESC LIMIT ${pageSize}::int OFFSET ${offset}::int`;
    return toPaginated(
      filas.map(({ total_filas: _t, ...r }) => r),
      filas[0]?.total_filas ?? 0,
      page,
      pageSize,
    );
  }

  /** Detalle completo: condiciones, matriz de pagos, cuotas con su estado de pago, deductivos, garantía y cuenta corriente. */
  async obtener(id: number) {
    const contrato = await leerContrato(this.sql, id);
    if (!contrato) throw new NotFoundException(`Contrato ${id} no encontrado`);
    const doc = await leerDocumento(this.sql, contrato.id_documento_origen);
    if (!doc) throw new NotFoundException(`La orden del contrato ${id} no existe`);
    const montos = montosDe(doc);
    const condiciones = condicionesDe(contrato);
    const cuotas = await leerCuotas(this.sql, id);
    const aprobadas = aprobadasDelEsquema(cuotas);
    const matriz = matrizDePagos({ doc: montos, condiciones, aprobadas, conAdelanto: condiciones.adelantoPct > 0 });
    const pagos = await leerPagos(this.sql, doc.id);
    const pagosProveedor = pagos.filter((p) => p.concepto === 'PROVEEDOR');
    const imputadas = imputarPagos(
      cuotas.filter((c) => c.estado === 'APROBADA').map((c) => ({ id: c.id, numero: c.tipoBD === 'GARANTIA' ? 100 + c.numero : c.numero, neto: c.neto })),
      pagosProveedor.map((p) => ({ monto: p.monto, idValorizacion: p.id_valorizacion })),
    );
    const estadoPago = new Map(imputadas.cuotas.map((c) => [c.id, c]));
    const deductivos = await leerDeductivos(this.sql, doc.id);
    const retenida = garantiaRetenida(cuotas);

    const movimientos: Movimiento[] = [];
    for (const c of cuotas.filter((x) => x.estado === 'APROBADA')) {
      const fecha = (c.aprobado_en ?? c.fecha_corte ?? hoyLima()).slice(0, 10);
      const etiqueta = c.tipoBD === 'ADELANTO' ? 'Adelanto' : c.tipoBD === 'GARANTIA' ? 'Devolución de la garantía' : `Valorización ${c.numero}`;
      movimientos.push({ fecha, tipo: c.tipoBD === 'GARANTIA' ? 'GARANTIA_DEVUELTA' : 'CUOTA', descripcion: etiqueta, devengado: c.neto, ...(c.tipoBD === 'GARANTIA' ? { garantia: Math.abs(c.garantia) } : {}) });
      if (c.tipoBD === 'VALORIZACION' && c.garantia > 0) movimientos.push({ fecha, tipo: 'GARANTIA_RETENIDA', descripcion: `Garantía de ${etiqueta}`, garantia: c.garantia });
    }
    for (const p of pagosProveedor) movimientos.push({ fecha: p.fecha_pago, tipo: 'PAGO', descripcion: p.numero, pagado: p.monto });
    const cuenta = armarCuentaCorriente(movimientos);

    const borrador = cuotas.find((c) => c.estado === 'BORRADOR' && c.tipoBD === 'VALORIZACION') ?? null;
    const supervisor = contrato.id_supervisor === null ? null : await this.nombreAnexo(contrato.id_supervisor);
    const vence = contrato.liquidado_en ? sumarMeses(contrato.liquidado_en, contrato.meses_garantia) : null;
    return {
      contrato: { ...contrato, adelanto_porcentaje: contrato.adelanto_porcentaje, supervisor },
      orden: {
        id: doc.id,
        numero_documento: doc.numero_documento,
        proveedor: doc.proveedor,
        id_centro_costo: doc.id_centro_costo,
        centro_costo: doc.centro_costo,
        cliente: doc.cliente,
        moneda_id: doc.moneda_id,
        moneda_simbolo: doc.moneda_simbolo,
        total: m2(doc.total),
        forma_pago: doc.forma_pago,
      },
      matriz: matriz.map((f) => ({ ...cuotaJson(f), situacion: f.situacion, id: 'id' in f ? (f as { id?: number }).id ?? null : null })),
      cuotas: cuotas.map((c) => {
        const p = estadoPago.get(c.id);
        return {
          id: c.id,
          numero_documento: c.numero_documento,
          estado: c.estado,
          fecha_corte: c.fecha_corte,
          avance_pct: c.avance_pct,
          origen_monto: c.origen_monto,
          factura_numero: c.factura_numero,
          factura_fecha: c.factura_fecha,
          aprobado_por: c.aprobado_por,
          aprobado_en: c.aprobado_en,
          ...cuotaJson(c),
          tipo: c.tipoBD,
          pagado: m2(p?.pagado ?? 0),
          saldo: m2(p?.saldo ?? c.neto),
          estado_pago: p?.estado ?? 'SIN_PAGAR',
        };
      }),
      id_borrador: borrador?.id ?? null,
      deductivos: deductivos.map((d) => ({ ...d, monto: m2(d.monto), aplicado: m2(d.aplicado), pendiente: m2(d.pendiente) })),
      garantia: {
        porcentaje: contrato.garantia_porcentaje,
        retenida: m2(retenida),
        meses: contrato.meses_garantia,
        vence,
        devolvible: contrato.estado === 'LIQUIDADO' && retenida > 0.005,
      },
      cuenta_corriente: {
        devengado: m2(cuenta.devengado),
        pagado: m2(cuenta.pagado),
        saldo: m2(cuenta.saldo),
        garantia_retenida: m2(cuenta.garantiaRetenida),
        filas: cuenta.filas.map((f) => ({ ...f, devengado: m2(f.devengado ?? 0), pagado: m2(f.pagado ?? 0), garantia: m2(f.garantia ?? 0), saldo: m2(f.saldo), garantiaRetenida: m2(f.garantiaRetenida) })),
      },
      sobrante_pagos: m2(imputadas.sobrante),
    };
  }

  // -------------------------------------------------------------- escritura

  /** Contrato de una orden de servicio manual (o de una de presupuesto cuando el alta automática está apagada). */
  async crear(idDocumento: number, user?: AuthUser) {
    const quien = user?.usuario ?? 'SISTEMA';
    const id = await this.db.transaction(async (tx) => {
      await this.bloquearDocumento(tx, idDocumento);
      const r = await altaContrato(this.sql, tx, idDocumento, quien);
      if (r.creado && r.id !== null) return r.id;
      if (r.id !== null) throw new ConflictException(r.motivo ?? 'La orden ya tiene contrato');
      throw new BadRequestException(r.motivo ?? 'No se pudo crear el contrato');
    });
    return this.obtener(id);
  }

  async actualizar(id: number, dto: UpdateContratoDto, _user?: AuthUser) {
    await this.db.transaction(async (tx) => {
      const idDoc = await this.documentoDeContrato(tx, id);
      await this.bloquearDocumento(tx, idDoc);
      await bloquearContrato(this.sql, tx, id);
      const c = await this.leerOFalla(id, tx);
      if (c.estado === 'ANULADO') throw new ConflictException('El contrato está anulado');
      const economico = [dto.adelanto_porcentaje, dto.garantia_porcentaje, dto.numero_valorizaciones, dto.meses_garantia].some((v) => v !== undefined);
      if (economico) await this.prepararCambioEconomico(tx, c, idDoc);

      const q = sqlTag(this.sql);
      await q.run(tx)`
        UPDATE contrato_valorizacion SET
          adelanto_porcentaje = CASE WHEN ${dto.adelanto_porcentaje !== undefined}::boolean THEN ${String(dto.adelanto_porcentaje ?? 0)}::numeric ELSE adelanto_porcentaje END,
          garantia_porcentaje = CASE WHEN ${dto.garantia_porcentaje !== undefined}::boolean THEN ${String(dto.garantia_porcentaje ?? 0)}::numeric ELSE garantia_porcentaje END,
          numero_valorizaciones = CASE WHEN ${dto.numero_valorizaciones !== undefined}::boolean THEN ${dto.numero_valorizaciones ?? 3}::int ELSE numero_valorizaciones END,
          meses_garantia = CASE WHEN ${dto.meses_garantia !== undefined}::boolean THEN ${dto.meses_garantia ?? 3}::int ELSE meses_garantia END,
          fecha_primera = CASE WHEN ${dto.fecha_primera !== undefined}::boolean THEN NULLIF(${dto.fecha_primera ?? ''}::text, '')::date ELSE fecha_primera END,
          id_supervisor = CASE WHEN ${dto.id_supervisor !== undefined}::boolean THEN ${dto.id_supervisor ?? 0}::int ELSE id_supervisor END,
          alcances = CASE WHEN ${dto.alcances !== undefined}::boolean THEN ${dto.alcances ?? ''}::text ELSE alcances END,
          condiciones_generales = CASE WHEN ${dto.condiciones_generales !== undefined}::boolean THEN ${dto.condiciones_generales ?? ''}::text ELSE condiciones_generales END,
          condiciones_comerciales = CASE WHEN ${dto.condiciones_comerciales !== undefined}::boolean THEN ${dto.condiciones_comerciales ?? ''}::text ELSE condiciones_comerciales END,
          updated_at = now()
         WHERE id = ${id}::int`;
    });
    return this.obtener(id);
  }

  /** Dar el visto de Operaciones (`valorizaciones · aprobar`) o de Administración (`valorizaciones.administracion · aprobar`). */
  async visto(id: number, rol: 'OPERACIONES' | 'ADMINISTRACION', user?: AuthUser) {
    const quien = user?.usuario ?? 'SISTEMA';
    await this.db.transaction(async (tx) => {
      const idDoc = await this.documentoDeContrato(tx, id);
      await this.bloquearDocumento(tx, idDoc);
      await bloquearContrato(this.sql, tx, id);
      const c = await this.leerOFalla(id, tx);
      if (c.estado !== 'BORRADOR') throw new ConflictException(c.estado === 'VIGENTE' ? 'El contrato ya tiene los dos vistos' : `El contrato está ${c.estado}`);
      const doc = await leerDocumento(this.sql, idDoc, tx);
      if (!doc || doc.estado !== 'REGISTRADO') throw new ConflictException('La orden de servicio debe estar registrada para dar el visto');
      const yaDado = rol === 'OPERACIONES' ? c.visto_operaciones_en : c.visto_administracion_en;
      if (yaDado) throw new ConflictException(`El visto de ${rol === 'OPERACIONES' ? 'Operaciones' : 'Administración'} ya está dado`);

      const q = sqlTag(this.sql);
      if (rol === 'OPERACIONES') {
        await q.run(tx)`UPDATE contrato_valorizacion SET visto_operaciones_por = ${quien}::text, visto_operaciones_en = now(), updated_at = now() WHERE id = ${id}::int`;
      } else {
        await q.run(tx)`UPDATE contrato_valorizacion SET visto_administracion_por = ${quien}::text, visto_administracion_en = now(), updated_at = now() WHERE id = ${id}::int`;
      }
      const ahora = await this.leerOFalla(id, tx);
      if (ahora.visto_operaciones_en && ahora.visto_administracion_en) await this.activar(tx, ahora, quien);
    });
    return this.obtener(id);
  }

  /** Devuelve la garantía retenida de un contrato liquidado: una cuota `GARANTIA` aprobada, con los deductivos pendientes descontados. */
  async devolverGarantia(id: number, dto: DevolverGarantiaDto, user?: AuthUser) {
    const quien = user?.usuario ?? 'SISTEMA';
    await this.db.transaction(async (tx) => {
      const idDoc = await this.documentoDeContrato(tx, id);
      await this.bloquearDocumento(tx, idDoc);
      await bloquearContrato(this.sql, tx, id);
      const c = await this.leerOFalla(id, tx);
      if (c.estado !== 'LIQUIDADO') throw new ConflictException('La garantía se devuelve cuando el contrato está liquidado');
      const cuotas = await leerCuotas(this.sql, id, tx);
      const retenida = garantiaRetenida(cuotas);
      if (retenida <= 0.005) throw new ConflictException('No hay garantía retenida por devolver');
      const hoy = hoyLima();
      const vence = sumarMeses(c.liquidado_en ?? hoy, c.meses_garantia);
      if (hoy < vence && !(dto.motivo ?? '').trim()) {
        throw new ConflictException(`La garantía vence el ${vence}: para devolverla antes indique el motivo`);
      }
      const pendientes = (await leerDeductivos(this.sql, idDoc, tx)).filter((d) => d.estado === 'PENDIENTE' && d.pendiente > 0.005);
      const reparto = repartirDeductivos(retenida, pendientes.map((d) => ({ id: d.id, pendiente: d.pendiente })));
      const numeroDoc = await this.ledger.siguienteNumero(tx, 'VAL');
      const orden = cuotas.filter((x) => x.tipoBD === 'GARANTIA').length + 1;
      const q = sqlTag(this.sql);
      const [fila] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO valorizacion (numero_documento, id_contrato, tipo, numero, estado, vigente, fecha_corte, origen_monto, observaciones, valorizado, amortizacion, facturable,
                                  garantia, descuentos, neto, registrado_por, aprobado_por, aprobado_en)
        VALUES (${numeroDoc}::text, ${id}::int, 'GARANTIA', ${orden}::int, 'APROBADA', true, ${hoy}::date, 'PLAN', NULLIF(${dto.motivo ?? ''}::text, ''), 0, 0,
                ${String(retenida)}::numeric, ${String(-retenida)}::numeric, ${String(reparto.total)}::numeric, ${String(redondear2(retenida - reparto.total))}::numeric,
                ${quien}::text, ${quien}::text, now())
        RETURNING id`;
      for (const a of reparto.aplicaciones) {
        await q.run(tx)`INSERT INTO valorizacion_deductivo (id_valorizacion, id_deductivo, monto) VALUES (${fila.id}::int, ${a.id}::int, ${String(a.monto)}::numeric)`;
      }
      await marcarAplicados(this.sql, tx, reparto.aplicaciones.map((a) => a.id));
    });
    return this.obtener(id);
  }

  // ---------------------------------------------------------------- privado

  private async leerOFalla(id: number, tx?: Tx): Promise<ContratoFila> {
    const c = await leerContrato(this.sql, id, tx);
    if (!c) throw new NotFoundException(`Contrato ${id} no encontrado`);
    return c;
  }

  private async documentoDeContrato(tx: Tx, id: number): Promise<number> {
    const q = sqlTag(this.sql);
    const [r] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id_documento_origen AS id FROM contrato_valorizacion WHERE id = ${id}::int`;
    if (!r) throw new NotFoundException(`Contrato ${id} no encontrado`);
    return r.id;
  }

  /** Bloquea la orden primero (el mismo orden que usa tesorería), para no abrir interbloqueos. */
  private async bloquearDocumento(tx: Tx, idDocumento: number): Promise<void> {
    const q = sqlTag(this.sql);
    await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "documentosOrigen" WHERE id = ${idDocumento}::int FOR UPDATE`;
  }

  /** Un cambio económico borra los vistos y devuelve el contrato a borrador; con valorizaciones aprobadas o pagos ya no se puede. */
  private async prepararCambioEconomico(tx: Tx, c: ContratoFila, idDoc: number): Promise<void> {
    if (c.estado === 'LIQUIDADO') throw new ConflictException('El contrato está liquidado: sus condiciones ya no se cambian');
    const q = sqlTag(this.sql);
    if (c.estado === 'VIGENTE') {
      const [r] = await q.rows<{ n: number }>({ n: I }, tx)`SELECT count(*)::int AS n FROM valorizacion WHERE id_contrato = ${c.id}::int AND estado::text <> 'ANULADA' AND tipo::text <> 'ADELANTO' AND estado::text = 'APROBADA'`;
      if ((r?.n ?? 0) > 0) throw new ConflictException('El contrato ya tiene valorizaciones aprobadas: anúlelas para cambiar el adelanto, la garantía o la cantidad de valorizaciones');
      if (await tieneMovimientoDePago(this.sql, idDoc, tx)) throw new ConflictException('El adelanto del contrato ya tiene pagos o programaciones: no se pueden cambiar sus condiciones económicas');
      await q.run(tx)`UPDATE valorizacion SET estado = 'ANULADA', vigente = NULL, motivo_anulacion = 'Cambiaron las condiciones del contrato' WHERE id_contrato = ${c.id}::int AND estado::text <> 'ANULADA'`;
    }
    await q.run(tx)`
      UPDATE contrato_valorizacion SET estado = 'BORRADOR', visto_operaciones_por = NULL, visto_operaciones_en = NULL, visto_administracion_por = NULL, visto_administracion_en = NULL
       WHERE id = ${c.id}::int`;
  }

  /** Con los dos vistos el contrato queda vigente y su adelanto, aprobado: ya se puede programar y pagar. */
  private async activar(tx: Tx, c: ContratoFila, quien: string): Promise<void> {
    const q = sqlTag(this.sql);
    await q.run(tx)`UPDATE contrato_valorizacion SET estado = 'VIGENTE', updated_at = now() WHERE id = ${c.id}::int`;
    const doc = await leerDocumento(this.sql, c.id_documento_origen, tx);
    if (!doc) return;
    const adelanto = calcularAdelanto(montosDe(doc), condicionesDe(c));
    if (adelanto.facturable <= 0.005) return;
    const numeroDoc = await this.ledger.siguienteNumero(tx, 'VAL');
    await q.run(tx)`
      INSERT INTO valorizacion (numero_documento, id_contrato, tipo, numero, estado, vigente, fecha_corte, origen_monto, valorizado, amortizacion, facturable, renta_4ta, detraccion,
                                detraccion_soles, retencion_igv, garantia, descuentos, neto, registrado_por, aprobado_por, aprobado_en)
      VALUES (${numeroDoc}::text, ${c.id}::int, 'ADELANTO', 0, 'APROBADA', true, ${hoyLima()}::date, 'PLAN', 0, 0, ${String(adelanto.facturable)}::numeric, ${String(adelanto.renta4ta)}::numeric,
              ${String(adelanto.detraccion)}::numeric, ${String(adelanto.detraccionSoles)}::numeric, ${String(adelanto.retencionIgv)}::numeric, 0, 0, ${String(adelanto.neto)}::numeric,
              ${quien}::text, ${quien}::text, now())`;
  }

  private async nombreAnexo(id: number): Promise<string | null> {
    const q = sqlTag(this.sql);
    const [r] = await q.rows<{ n: string | null }>({ n: TN })`SELECT COALESCE("NombreComercial", "Anexo")::text AS n FROM anexos WHERE id = ${id}::int`;
    return r?.n ?? null;
  }
}

