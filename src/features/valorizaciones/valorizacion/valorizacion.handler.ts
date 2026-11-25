import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, T, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { aDia, deDia, lunesDe } from '../../operaciones-obra/shared/control-avance/calendario.js';
import { registrarEvento } from '../../operaciones-obra/shared/control-avance/registrar-evento.js';
import { hoyLima } from '../../operaciones-obra/shared/obra-shared.js';
import { calcularValorizacion, type ResultadoCalculo } from '../shared/calculo.js';
import { redondear2 } from '../shared/cuota.js';
import {
  bloquearContrato,
  cuotaConMovimiento,
  leerContrato,
  leerCuotas,
  leerDeductivos,
  leerDocumento,
  leerLineasOrden,
  type ContratoFila,
  type CuotaFila,
} from '../shared/datos.js';
import { liberarDeductivosDeCuota, marcarAplicados } from '../shared/deductivos-estado.js';
import { cuotaJson, m2 } from '../shared/serializar.js';
import type { ActualizarCuotaDto, AnularCuotaDto, CrearCuotaDto, RegistrarFacturaDto } from './valorizacion.dto.js';

/** Textos libres que viajan junto con los montos al guardar una cuota. */
interface DatosCuota {
  fecha_corte: string;
  observaciones: string | null;
  motivo_monto: string | null;
  factura_numero: string | null;
  factura_fecha: string | null;
  factura_url: string | null;
}

@Injectable()
export class ValorizacionHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  private get ctx() {
    return { sql: this.sql, orm: this.db.orm.public };
  }

  // ---------------------------------------------------------------- lectura

  /** Bandeja de la semana: los contratos vigentes con una valorización por hacer, con lo que propone el sistema al corte de esa semana. */
  async semana(fecha?: string) {
    const hoy = hoyLima();
    const base = fecha ?? hoy;
    const domingo = deDia(lunesDe(aDia(base)) + 6);
    const corte = domingo > hoy ? hoy : domingo;
    const q = sqlTag(this.sql);
    const contratos = await q.rows<{ id: number }>({ id: I })`SELECT id FROM contrato_valorizacion WHERE estado::text = 'VIGENTE' ORDER BY id`;
    const filas = [];
    for (const { id } of contratos) {
      try {
        const cuotas = await leerCuotas(this.sql, id);
        const borrador = cuotas.find((c) => c.estado === 'BORRADOR' && c.tipoBD === 'VALORIZACION') ?? null;
        const calc = await calcularValorizacion(this.ctx, { idContrato: id, corte });
        filas.push({
          id_contrato: id,
          id_documento_origen: calc.doc.id,
          numero_documento: calc.doc.numero_documento,
          proveedor: calc.doc.proveedor,
          centro_costo: calc.doc.centro_costo,
          cliente: calc.doc.cliente,
          moneda_simbolo: calc.doc.moneda_simbolo,
          numero: calc.numero,
          es_ultima: calc.esUltima,
          total: m2(calc.montos.total),
          pendiente: m2(calc.pendiente),
          plan: m2(calc.plan),
          sugerido: m2(calc.sugerido),
          avance_pct: calc.avancePct,
          falta_avance: calc.faltaAvance,
          id_borrador: borrador?.id ?? null,
          alertas: calc.alertas,
        });
      } catch (e) {
        if (!(e instanceof ConflictException)) throw e; // un contrato que ya no tiene nada por valorizar no sale en la bandeja
      }
    }
    return { fecha: base, corte, filas };
  }

  /** Una cuota: el borrador se recalcula al leer (el avance puede haber cambiado); la aprobada es la que se congeló. */
  async obtener(id: number) {
    const cuota = await this.cuotaPorId(id);
    const contrato = (await leerContrato(this.sql, cuota.id_contrato))!;
    const doc = await leerDocumento(this.sql, contrato.id_documento_origen);
    if (!doc) throw new NotFoundException('La orden del contrato no existe');
    const cabecera = {
      id: cuota.id,
      estado: cuota.estado,
      tipo: cuota.tipoBD,
      numero: cuota.numero,
      numero_documento: cuota.numero_documento,
      contrato: { id: contrato.id, estado: contrato.estado, numero_valorizaciones: contrato.numero_valorizaciones, adelanto_porcentaje: contrato.adelanto_porcentaje, garantia_porcentaje: contrato.garantia_porcentaje },
      orden: { id: doc.id, numero_documento: doc.numero_documento, proveedor: doc.proveedor, centro_costo: doc.centro_costo, cliente: doc.cliente, moneda_simbolo: doc.moneda_simbolo, total: m2(doc.total) },
      factura: { numero: cuota.factura_numero, fecha: cuota.factura_fecha, url: cuota.factura_url },
      observaciones: cuota.observaciones,
      motivo_monto: cuota.motivo_monto,
      aprobado_por: cuota.aprobado_por,
      aprobado_en: cuota.aprobado_en,
      motivo_anulacion: cuota.motivo_anulacion,
    };

    if (cuota.estado === 'BORRADOR') {
      const calc = await calcularValorizacion(this.ctx, await this.entradaDeBorrador(cuota));
      const deds = await leerDeductivos(this.sql, doc.id);
      return {
        ...cabecera,
        fecha_corte: cuota.fecha_corte,
        avance_pct: calc.avancePct,
        origen_monto: calc.origen,
        cuota: cuotaJson(calc.cuota),
        plan: m2(calc.plan),
        sugerido: m2(calc.sugerido),
        pendiente: m2(calc.pendiente),
        restantes: calc.restantes,
        es_ultima: calc.esUltima,
        falta_avance: calc.faltaAvance,
        alertas: calc.alertas,
        lineas: calc.lineas.map((l) => ({
          id_orden_detalle: l.id,
          codigo: l.codigo,
          descripcion: l.descripcion,
          unidad: l.unidad,
          subfase: l.subfase,
          monto: m2(l.monto),
          avance_obra: l.avanceObra,
          avance_acumulado: l.avanceAcumulado,
          avance_manual: l.avanceManual,
          monto_anterior: m2(l.montoAnterior),
          monto_presente: m2(l.montoPresente),
          monto_acumulado: m2(l.montoAcumulado),
          saldo: m2(l.saldo),
        })),
        deductivos: calc.aplicaciones.map((a) => {
          const d = deds.find((x) => x.id === a.id);
          return { id: a.id, descripcion: d?.descripcion ?? null, motivo: d?.motivo ?? null, monto: m2(a.monto) };
        }),
      };
    }

    // Aprobada (o anulada): lo guardado.
    const q = sqlTag(this.sql);
    const lineasOrden = await leerLineasOrden(this.sql, doc.id);
    const guardadas = await q.rows<{ id_orden_detalle: number; avance: string; manual: boolean; anterior: string; presente: string }>(
      { id_orden_detalle: I, avance: T, manual: { codecId: 'pg/bool@1', nullable: false }, anterior: T, presente: T },
    )`SELECT id_orden_detalle, avance_acumulado::text AS avance, avance_manual AS manual, monto_anterior::text AS anterior, monto_presente::text AS presente
        FROM valorizacion_linea WHERE id_valorizacion = ${id}::int ORDER BY id`;
    const sumaMontos = lineasOrden.reduce((a, l) => a + l.monto, 0);
    const factor = sumaMontos > 0 ? doc.total / sumaMontos : 0;
    const aplicados = await q.rows<{ id: number; descripcion: string; motivo: string; monto: string }>({ id: I, descripcion: T, motivo: T, monto: T })`
      SELECT d.id, d.descripcion::text AS descripcion, d.motivo::text AS motivo, a.monto::text AS monto
        FROM valorizacion_deductivo a JOIN deductivo_proveedor d ON d.id = a.id_deductivo WHERE a.id_valorizacion = ${id}::int ORDER BY d.id`;
    return {
      ...cabecera,
      fecha_corte: cuota.fecha_corte,
      avance_pct: cuota.avance_pct,
      origen_monto: cuota.origen_monto,
      cuota: cuotaJson(cuota),
      plan: null,
      sugerido: null,
      pendiente: null,
      restantes: null,
      es_ultima: cuota.numero >= contrato.numero_valorizaciones,
      falta_avance: false,
      alertas: [],
      lineas: guardadas.map((g) => {
        const l = lineasOrden.find((x) => x.id === g.id_orden_detalle);
        const acumulado = redondear2(Number(g.anterior) + Number(g.presente));
        return {
          id_orden_detalle: g.id_orden_detalle,
          codigo: l?.codigo ?? null,
          descripcion: l?.descripcion ?? null,
          unidad: l?.unidad ?? null,
          subfase: l?.subfase ?? null,
          monto: m2(l?.monto ?? 0),
          avance_obra: null,
          avance_acumulado: Number(g.avance),
          avance_manual: g.manual,
          monto_anterior: m2(Number(g.anterior)),
          monto_presente: m2(Number(g.presente)),
          monto_acumulado: m2(acumulado),
          saldo: m2(Math.max((l?.monto ?? 0) * factor - acumulado, 0)),
        };
      }),
      deductivos: aplicados,
    };
  }

  // -------------------------------------------------------------- escritura

  /** Abre el borrador de la próxima valorización del contrato, calculada con el avance al corte. */
  async crear(idContrato: number, dto: CrearCuotaDto, user?: AuthUser) {
    const quien = user?.usuario ?? 'SISTEMA';
    const id = await this.db.transaction(async (tx) => {
      const contrato = await this.bloquear(tx, idContrato);
      this.exigirVigente(contrato);
      const cuotas = await leerCuotas(this.sql, idContrato, tx);
      if (cuotas.some((c) => c.estado === 'BORRADOR' && c.tipoBD === 'VALORIZACION')) {
        throw new ConflictException('El contrato ya tiene una valorización en borrador: termínela o anúlela antes de abrir otra');
      }
      this.validarCorte(dto.fecha_corte);
      const avancesManuales = await this.avancesManuales(tx, contrato.id_documento_origen, dto.lineas);
      const calc = await calcularValorizacion({ ...this.ctx, tx }, { idContrato, corte: dto.fecha_corte, valorizado: dto.valorizado, avancesManuales, deductivoIds: dto.deductivos, reajuste: dto.reajuste });
      const q = sqlTag(this.sql);
      const [fila] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO valorizacion (id_contrato, tipo, numero, estado, registrado_por) VALUES (${idContrato}::int, 'VALORIZACION', ${calc.numero}::int, 'BORRADOR', ${quien}::text)
        RETURNING id`;
      await this.escribir(tx, fila.id, calc, this.datos(dto, null), avancesManuales);
      return fila.id;
    });
    return this.obtener(id);
  }

  /** Cambia el borrador (fecha de corte, monto, avance manual, deductivos, factura) y lo recalcula. */
  async actualizar(id: number, dto: ActualizarCuotaDto, _user?: AuthUser) {
    await this.db.transaction(async (tx) => {
      const cuota = await this.cuotaPorId(id, tx);
      const contrato = await this.bloquear(tx, cuota.id_contrato);
      this.exigirVigente(contrato);
      const actual = await this.cuotaPorId(id, tx);
      if (actual.estado !== 'BORRADOR') throw new ConflictException('Solo se edita una valorización en borrador');
      const previa = await this.entradaDeBorrador(actual, tx);
      const corte = dto.fecha_corte ?? previa.corte;
      this.validarCorte(corte);
      const manuales = dto.lineas ? await this.avancesManuales(tx, contrato.id_documento_origen, dto.lineas) : (previa.avancesManuales as Map<number, number>);
      const valorizado = dto.valorizado !== undefined ? dto.valorizado : previa.valorizado;
      const calc = await calcularValorizacion({ ...this.ctx, tx }, { idContrato: contrato.id, corte, valorizado, avancesManuales: manuales, deductivoIds: dto.deductivos ?? previa.deductivoIds, reajuste: dto.reajuste !== undefined ? dto.reajuste : previa.reajuste });
      await this.escribir(tx, id, calc, this.datos(dto, actual, corte), manuales);
    });
    return this.obtener(id);
  }

  /** Aprueba la valorización: recalcula en el servidor, congela los montos, numera (`VAL-`) y, si agotó lo pendiente, liquida el contrato. */
  async aprobar(id: number, user?: AuthUser) {
    const quien = user?.usuario ?? 'SISTEMA';
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const cuota0 = await this.cuotaPorId(id, tx);
      const contrato = await this.bloquear(tx, cuota0.id_contrato);
      this.exigirVigente(contrato);
      await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM valorizacion WHERE id = ${id}::int FOR UPDATE`;
      const cuota = await this.cuotaPorId(id, tx);
      if (cuota.estado !== 'BORRADOR') throw new ConflictException(`La valorización está ${cuota.estado}`);
      const hoy = hoyLima();
      if (cuota.fecha_corte === null || cuota.fecha_corte > hoy) throw new BadRequestException('La fecha de corte de la valorización no puede ser futura');

      const entrada = await this.entradaDeBorrador(cuota, tx);
      const calc = await calcularValorizacion({ ...this.ctx, tx }, entrada);
      if (calc.faltaAvance) {
        throw new BadRequestException({ codigo: 'AVANCE_REQUERIDO', message: 'Hay partidas sin avance (ni de la obra ni escrito a mano): escriba el avance de cada una para aprobar' });
      }
      const motivoPendiente = calc.origen === 'SUPERVISOR' || (calc.esUltima && (calc.avancePct === null || calc.avancePct < 99.5));
      if (motivoPendiente && !(cuota.motivo_monto ?? '').trim()) {
        throw new BadRequestException({
          codigo: 'MOTIVO_REQUERIDO',
          message: calc.origen === 'SUPERVISOR' ? 'El monto es distinto del sugerido: indique el motivo para aprobar' : 'La última cuota toma todo lo pendiente con la obra por debajo del 100 %: indique el motivo para aprobar',
        });
      }

      const manuales = entrada.avancesManuales as Map<number, number>;
      await this.escribir(tx, id, calc, { fecha_corte: cuota.fecha_corte, observaciones: cuota.observaciones, motivo_monto: cuota.motivo_monto, factura_numero: cuota.factura_numero, factura_fecha: cuota.factura_fecha, factura_url: cuota.factura_url }, manuales);
      const numeroDoc = await this.ledger.siguienteNumero(tx, 'VAL');
      await q.run(tx)`
        UPDATE valorizacion SET numero = ${calc.numero}::int, estado = 'APROBADA', vigente = true, numero_documento = ${numeroDoc}::text, aprobado_por = ${quien}::text, aprobado_en = now()
         WHERE id = ${id}::int`;
      await marcarAplicados(this.sql, tx, calc.aplicaciones.map((a) => a.id));

      const agotado = calc.montos.total - (calc.montos.total - calc.pendiente) - calc.valorizado <= 0.005;
      if (agotado) await q.run(tx)`UPDATE contrato_valorizacion SET estado = 'LIQUIDADO', liquidado_en = ${hoy}::date, updated_at = now() WHERE id = ${contrato.id}::int`;
      if (calc.doc.id_centro_costo !== null && (await this.obraEnControl(tx, calc.doc.id_centro_costo))) {
        await registrarEvento(tx.orm.public, {
          idCentroCosto: calc.doc.id_centro_costo,
          tipo: 'ESTADO',
          titulo: `Valorización ${calc.numero} aprobada · ${calc.doc.proveedor ?? 'contratista'}`,
          detalle: `${numeroDoc}: valorizado ${m2(calc.valorizado)}, neto ${m2(calc.cuota.neto)}${agotado ? ' · contrato liquidado' : ''}`,
          usuario: quien,
        });
      }
    });
    return this.obtener(id);
  }

  /** Anota la factura de una cuota ya aprobada (el adelanto o una valorización). Se puede cambiar mientras el contrato siga abierto o liquidado. */
  async registrarFactura(id: number, dto: RegistrarFacturaDto) {
    await this.db.transaction(async (tx) => {
      const cuota0 = await this.cuotaPorId(id, tx);
      await this.bloquear(tx, cuota0.id_contrato);
      const cuota = await this.cuotaPorId(id, tx);
      if (cuota.estado !== 'APROBADA' || cuota.tipoBD === 'GARANTIA') throw new ConflictException('Solo se factura una cuota aprobada (el adelanto o una valorización)');
      const q = sqlTag(this.sql);
      await q.run(tx)`
        UPDATE valorizacion SET factura_numero = ${dto.factura_numero.trim()}::text, factura_fecha = NULLIF(${dto.factura_fecha ?? ''}::text, '')::date,
               factura_url = NULLIF(${dto.factura_url ?? ''}::text, '')
         WHERE id = ${id}::int`;
    });
    return this.obtener(id);
  }

  /** Anula una valorización: la última aprobada, sin pagos ni programaciones (o un borrador). Libera sus deductivos y lo siguiente se recalcula. */
  async anular(id: number, dto: AnularCuotaDto, user?: AuthUser) {
    const quien = user?.usuario ?? 'SISTEMA';
    const idContrato = await this.db.transaction(async (tx) => {
      const cuota0 = await this.cuotaPorId(id, tx);
      const contrato = await this.bloquear(tx, cuota0.id_contrato);
      const cuota = await this.cuotaPorId(id, tx);
      if (cuota.tipoBD !== 'VALORIZACION') throw new ConflictException('Solo se anula una valorización; el adelanto cambia con las condiciones del contrato');
      if (cuota.estado === 'APROBADA') {
        const todas = await leerCuotas(this.sql, contrato.id, tx);
        const ultimaAprobada = todas.filter((c) => c.estado === 'APROBADA' && c.tipoBD === 'VALORIZACION').reduce((m, c) => Math.max(m, c.numero), 0);
        if (cuota.numero !== ultimaAprobada) throw new ConflictException('Solo se anula la última valorización aprobada: la cadena de acumulados no admite huecos');
        if (todas.some((c) => c.estado === 'APROBADA' && c.tipoBD === 'GARANTIA')) throw new ConflictException('La garantía ya se devolvió: no se anulan valorizaciones');
        if (await cuotaConMovimiento(this.sql, id, tx)) throw new ConflictException('La valorización tiene pagos o programaciones: cancélelos primero');
      } else if (cuota.estado !== 'BORRADOR') {
        throw new ConflictException(`La valorización ya está ${cuota.estado}`);
      }
      const q = sqlTag(this.sql);
      await liberarDeductivosDeCuota(this.sql, tx, id);
      await q.run(tx)`
        UPDATE valorizacion SET estado = 'ANULADA', vigente = NULL, anulado_por = ${quien}::text, anulado_en = now(), motivo_anulacion = ${dto.motivo}::text WHERE id = ${id}::int`;
      if (contrato.estado === 'LIQUIDADO') {
        await q.run(tx)`UPDATE contrato_valorizacion SET estado = 'VIGENTE', liquidado_en = NULL, updated_at = now() WHERE id = ${contrato.id}::int`;
      }
      return contrato.id;
    });
    return { id, id_contrato: idContrato, estado: 'ANULADA' };
  }

  // ---------------------------------------------------------------- privado

  /** Bloquea la orden y después el contrato (el orden de tesorería) y devuelve el contrato ya bloqueado. */
  private async bloquear(tx: Tx, idContrato: number): Promise<ContratoFila> {
    const q = sqlTag(this.sql);
    const [r] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id_documento_origen AS id FROM contrato_valorizacion WHERE id = ${idContrato}::int`;
    if (!r) throw new NotFoundException(`Contrato ${idContrato} no encontrado`);
    await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "documentosOrigen" WHERE id = ${r.id}::int FOR UPDATE`;
    await bloquearContrato(this.sql, tx, idContrato);
    const c = await leerContrato(this.sql, idContrato, tx);
    if (!c) throw new NotFoundException(`Contrato ${idContrato} no encontrado`);
    return c;
  }

  private exigirVigente(c: ContratoFila): void {
    if (c.estado === 'VIGENTE') return;
    if (c.estado === 'BORRADOR') throw new ConflictException({ codigo: 'CONTRATO_SIN_VISTOS', message: 'El contrato todavía no tiene los dos vistos (Operaciones y Administración)' });
    throw new ConflictException(`El contrato está ${c.estado}: no admite valorizaciones`);
  }

  private validarCorte(corte: string): void {
    if (corte > hoyLima()) throw new BadRequestException('La fecha de corte no puede ser futura');
  }

  private async cuotaPorId(id: number, tx?: Tx): Promise<CuotaFila> {
    const q = sqlTag(this.sql);
    const [r] = await q.rows<{ id_contrato: number }>({ id_contrato: I }, tx)`SELECT id_contrato FROM valorizacion WHERE id = ${id}::int`;
    if (!r) throw new NotFoundException(`Valorización ${id} no encontrada`);
    const q2 = sqlTag(this.sql);
    // `leerCuotas` oculta las anuladas: una cuota anulada se consulta igual por su id.
    const todas = await leerCuotas(this.sql, r.id_contrato, tx);
    const c = todas.find((x) => x.id === id);
    if (c) return c;
    const [anulada] = await q2.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM valorizacion WHERE id = ${id}::int AND estado::text = 'ANULADA'`;
    if (anulada) throw new ConflictException('La valorización está anulada');
    throw new NotFoundException(`Valorización ${id} no encontrada`);
  }

  private datos(dto: Partial<CrearCuotaDto>, previa: CuotaFila | null, corte?: string): DatosCuota {
    return {
      fecha_corte: corte ?? dto.fecha_corte ?? previa?.fecha_corte ?? hoyLima(),
      observaciones: dto.observaciones !== undefined ? dto.observaciones || null : (previa?.observaciones ?? null),
      motivo_monto: dto.motivo_monto !== undefined ? dto.motivo_monto || null : (previa?.motivo_monto ?? null),
      factura_numero: dto.factura_numero !== undefined ? dto.factura_numero || null : (previa?.factura_numero ?? null),
      factura_fecha: dto.factura_fecha !== undefined ? dto.factura_fecha || null : (previa?.factura_fecha ?? null),
      factura_url: dto.factura_url !== undefined ? dto.factura_url || null : (previa?.factura_url ?? null),
    };
  }

  /** Avance escrito a mano: cada línea debe ser de la orden del contrato. */
  private async avancesManuales(tx: Tx, idDocumento: number, lineas: CrearCuotaDto['lineas']): Promise<Map<number, number>> {
    const mapa = new Map<number, number>();
    if (!lineas || lineas.length === 0) return mapa;
    const validas = new Set((await leerLineasOrden(this.sql, idDocumento, tx)).map((l) => l.id));
    for (const l of lineas) {
      if (!validas.has(l.id_orden_detalle)) throw new BadRequestException(`La línea ${l.id_orden_detalle} no es de la orden de servicio del contrato`);
      mapa.set(l.id_orden_detalle, l.avance_pct);
    }
    return mapa;
  }

  /** Lo que el borrador guardó y hace falta para volver a calcularlo: corte, avances manuales, deductivos elegidos y, si el supervisor puso un monto, ese monto. */
  private async entradaDeBorrador(cuota: CuotaFila, tx?: Tx) {
    const q = sqlTag(this.sql);
    const manuales = await q.rows<{ id: number; avance: string }>({ id: I, avance: T }, tx)`
      SELECT id_orden_detalle AS id, avance_acumulado::text AS avance FROM valorizacion_linea WHERE id_valorizacion = ${cuota.id}::int AND avance_manual`;
    const deductivos = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id_deductivo AS id FROM valorizacion_deductivo WHERE id_valorizacion = ${cuota.id}::int`;
    return {
      idContrato: cuota.id_contrato,
      corte: cuota.fecha_corte ?? hoyLima(),
      valorizado: cuota.origen_monto === 'SUPERVISOR' ? cuota.valorizado : undefined,
      avancesManuales: new Map(manuales.map((m) => [m.id, Number(m.avance)] as const)) as ReadonlyMap<number, number>,
      deductivoIds: deductivos.map((d) => d.id) as readonly number[] | undefined,
      reajuste: cuota.reajuste,
    };
  }

  /** Escribe el cálculo en la cuota y reemplaza sus líneas y deductivos. */
  private async escribir(tx: Tx, id: number, calc: ResultadoCalculo, d: DatosCuota, manuales: ReadonlyMap<number, number>): Promise<void> {
    const q = sqlTag(this.sql);
    const c = calc.cuota;
    await q.run(tx)`
      UPDATE valorizacion SET
        fecha_corte = ${d.fecha_corte}::date, avance_pct = NULLIF(${calc.avancePct === null ? '' : String(calc.avancePct)}::text, '')::numeric, origen_monto = ${calc.origen}::text,
        observaciones = NULLIF(${d.observaciones ?? ''}::text, ''), motivo_monto = NULLIF(${d.motivo_monto ?? ''}::text, ''),
        valorizado = ${String(c.valorizado)}::numeric, amortizacion = ${String(c.amortizacion)}::numeric, facturable = ${String(c.facturable)}::numeric,
        renta_4ta = ${String(c.renta4ta)}::numeric, detraccion = ${String(c.detraccion)}::numeric, detraccion_soles = ${String(c.detraccionSoles)}::numeric,
        retencion_igv = ${String(c.retencionIgv)}::numeric, garantia = ${String(c.garantia)}::numeric, descuentos = ${String(c.descuentos)}::numeric, reajuste = ${String(c.reajuste)}::numeric, neto = ${String(c.neto)}::numeric,
        factura_numero = NULLIF(${d.factura_numero ?? ''}::text, ''), factura_fecha = NULLIF(${d.factura_fecha ?? ''}::text, '')::date, factura_url = NULLIF(${d.factura_url ?? ''}::text, '')
       WHERE id = ${id}::int`;
    await q.run(tx)`DELETE FROM valorizacion_linea WHERE id_valorizacion = ${id}::int`;
    for (const l of calc.lineas) {
      await q.run(tx)`
        INSERT INTO valorizacion_linea (id_valorizacion, id_orden_detalle, avance_acumulado, avance_manual, monto_anterior, monto_presente)
        VALUES (${id}::int, ${l.id}::int, ${String(l.avanceAcumulado)}::numeric, ${manuales.has(l.id)}::boolean, ${String(l.montoAnterior)}::numeric, ${String(l.montoPresente)}::numeric)`;
    }
    await q.run(tx)`DELETE FROM valorizacion_deductivo WHERE id_valorizacion = ${id}::int`;
    for (const a of calc.aplicaciones) {
      await q.run(tx)`INSERT INTO valorizacion_deductivo (id_valorizacion, id_deductivo, monto) VALUES (${id}::int, ${a.id}::int, ${String(a.monto)}::numeric)`;
    }
  }

  private async obraEnControl(tx: Tx, idCentroCosto: number): Promise<boolean> {
    const q = sqlTag(this.sql);
    const [r] = await q.rows<{ n: number }>({ n: I }, tx)`SELECT count(*)::int AS n FROM obra_datos_generales WHERE id_centro_costo = ${idCentroCosto}::int`;
    return (r?.n ?? 0) > 0;
  }
}
