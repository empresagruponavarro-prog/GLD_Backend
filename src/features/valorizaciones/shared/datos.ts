import { AlmacenSql, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { redondear } from '../../tesoreria/shared/tributos.js';
import type { CuotaCalculada, MontosDocumento } from './cuota.js';

/**
 * Lecturas de SQL del módulo de valorizaciones (plan 12): el contrato, la orden a la que pertenece, sus cuotas, deductivos, líneas y pagos.
 * Todo importe `numeric` se lee como texto y se pasa a número aquí.
 */

const num = (v: string | null | undefined): number => Number(v ?? 0);

export type EstadoContrato = 'BORRADOR' | 'VIGENTE' | 'LIQUIDADO' | 'ANULADO';
export type TipoCuotaBD = 'ADELANTO' | 'VALORIZACION' | 'GARANTIA';
export type EstadoCuota = 'BORRADOR' | 'APROBADA' | 'ANULADA';

// ───────────────────────────────────────────────────────────── contrato

export interface ContratoFila {
  id: number;
  id_documento_origen: number;
  estado: EstadoContrato;
  adelanto_porcentaje: number;
  garantia_porcentaje: number;
  numero_valorizaciones: number;
  meses_garantia: number;
  fecha_primera: string | null;
  id_supervisor: number | null;
  alcances: string | null;
  condiciones_generales: string | null;
  condiciones_comerciales: string | null;
  visto_operaciones_por: string | null;
  visto_operaciones_en: string | null;
  visto_administracion_por: string | null;
  visto_administracion_en: string | null;
  liquidado_en: string | null;
  registrado_por: string | null;
}

const CONTRATO_SPEC = {
  id: I,
  id_documento_origen: I,
  estado: T,
  adelanto_porcentaje: T,
  garantia_porcentaje: T,
  numero_valorizaciones: I,
  meses_garantia: I,
  fecha_primera: TN,
  id_supervisor: IN,
  alcances: TN,
  condiciones_generales: TN,
  condiciones_comerciales: TN,
  visto_operaciones_por: TN,
  visto_operaciones_en: TN,
  visto_administracion_por: TN,
  visto_administracion_en: TN,
  liquidado_en: TN,
  registrado_por: TN,
} as const;

type ContratoCruda = Omit<ContratoFila, 'adelanto_porcentaje' | 'garantia_porcentaje' | 'estado'> & { adelanto_porcentaje: string; garantia_porcentaje: string; estado: string };
const aContrato = (r: ContratoCruda): ContratoFila => ({ ...r, estado: r.estado as EstadoContrato, adelanto_porcentaje: num(r.adelanto_porcentaje), garantia_porcentaje: num(r.garantia_porcentaje) });

export async function leerContrato(sql: AlmacenSql, id: number, tx?: Tx): Promise<ContratoFila | null> {
  const q = sqlTag(sql);
  const [r] = await q.rows<ContratoCruda>(CONTRATO_SPEC, tx)`
    SELECT id, id_documento_origen, estado::text AS estado, adelanto_porcentaje::text AS adelanto_porcentaje, garantia_porcentaje::text AS garantia_porcentaje,
           numero_valorizaciones, meses_garantia, fecha_primera::text AS fecha_primera, id_supervisor, alcances, condiciones_generales, condiciones_comerciales,
           visto_operaciones_por::text AS visto_operaciones_por, visto_operaciones_en::text AS visto_operaciones_en,
           visto_administracion_por::text AS visto_administracion_por, visto_administracion_en::text AS visto_administracion_en,
           liquidado_en::text AS liquidado_en, registrado_por::text AS registrado_por
      FROM contrato_valorizacion WHERE id = ${id}::int`;
  return r ? aContrato(r) : null;
}

export async function contratoDeDocumento(sql: AlmacenSql, idDocumento: number, tx?: Tx): Promise<ContratoFila | null> {
  const q = sqlTag(sql);
  const [r] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM contrato_valorizacion WHERE id_documento_origen = ${idDocumento}::int`;
  return r ? leerContrato(sql, r.id, tx) : null;
}

/** Bloquea el contrato (`FOR UPDATE`) hasta el fin de la transacción. Siempre después de bloquear su orden: es el orden que usa tesorería. */
export async function bloquearContrato(sql: AlmacenSql, tx: Tx, id: number): Promise<void> {
  const q = sqlTag(sql);
  await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM contrato_valorizacion WHERE id = ${id}::int FOR UPDATE`;
}

// ───────────────────────────────────────────────────────────── orden (documento de origen)

export interface DocContrato {
  id: number;
  numero_documento: string | null;
  clase: string | null;
  estado: string;
  id_anexo: number | null;
  proveedor: string | null;
  id_centro_costo: number | null;
  centro_costo: string | null;
  id_cliente: number | null;
  cliente: string | null;
  moneda_id: string | null;
  moneda_simbolo: string | null;
  forma_pago: string | null;
  total: number;
  monto: number;
  renta_4ta: number;
  /** Suma de los descuentos sueltos del documento: con contrato deben estar en 0 (se usan deductivos). */
  descuentos: number;
  detraccion_porcentaje: number | null;
  /** Detracción en soles, entera (`detraccion_monto` del documento). */
  detraccion_soles: number;
  retencion_igv: number;
  id_cotizacion: number | null;
  lineas: number;
}

export async function leerDocumento(sql: AlmacenSql, idDocumento: number, tx?: Tx): Promise<DocContrato | null> {
  const q = sqlTag(sql);
  const [r] = await q.rows<Record<string, string | number | null>>(
    {
      id: I, numero_documento: TN, clase: TN, estado: T, id_anexo: IN, proveedor: TN, id_centro_costo: IN, centro_costo: TN, id_cliente: IN, cliente: TN,
      moneda_id: TN, moneda_simbolo: TN, forma_pago: TN, total: T, monto: T, renta_4ta: T, descuentos: T, detraccion_porcentaje: TN, detraccion_soles: T,
      retencion_igv: T, id_cotizacion: IN, lineas: I,
    },
    tx,
  )`
    SELECT o.id, COALESCE(o.numero_documento, o.numero_oc)::text AS numero_documento, o.clase_documento::text AS clase, o.estado::text AS estado, o.id_anexo,
           COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, o.id_centro_costo, cc.centro_costo::text AS centro_costo,
           cc.id_anexo AS id_cliente, COALESCE(cl."NombreComercial", cl."Anexo")::text AS cliente,
           o.moneda_id::text AS moneda_id, o.moneda_simbolo::text AS moneda_simbolo, o.forma_pago::text AS forma_pago,
           COALESCE(o.total, 0)::text AS total, COALESCE(o.monto, 0)::text AS monto, COALESCE(o.renta_4ta, 0)::text AS renta_4ta,
           (COALESCE(o.dscto_compras, 0) + COALESCE(o.dscto_intervencion, 0) + COALESCE(o.dscto_otros, 0))::text AS descuentos,
           o.detraccion_porcentaje::text AS detraccion_porcentaje, COALESCE(o.detraccion_monto, 0)::text AS detraccion_soles,
           COALESCE(o.retencion_monto, 0)::text AS retencion_igv, o.id_cotizacion,
           (SELECT count(*)::int FROM "ordenCompraDetalle" d WHERE d.id_orden_compra = o.id) AS lineas
      FROM "documentosOrigen" o
      LEFT JOIN anexos a ON a.id = o.id_anexo
      LEFT JOIN "CentroCostos" cc ON cc.id = o.id_centro_costo
      LEFT JOIN anexos cl ON cl.id = cc.id_anexo
     WHERE o.id = ${idDocumento}::int`;
  if (!r) return null;
  const s = (k: string) => r[k] as string | null;
  return {
    id: r['id'] as number,
    numero_documento: s('numero_documento'),
    clase: s('clase'),
    estado: s('estado') ?? '',
    id_anexo: r['id_anexo'] as number | null,
    proveedor: s('proveedor'),
    id_centro_costo: r['id_centro_costo'] as number | null,
    centro_costo: s('centro_costo'),
    id_cliente: r['id_cliente'] as number | null,
    cliente: s('cliente'),
    moneda_id: s('moneda_id'),
    moneda_simbolo: s('moneda_simbolo'),
    forma_pago: s('forma_pago'),
    total: num(s('total')),
    monto: num(s('monto')),
    renta_4ta: num(s('renta_4ta')),
    descuentos: num(s('descuentos')),
    detraccion_porcentaje: s('detraccion_porcentaje') === null ? null : num(s('detraccion_porcentaje')),
    detraccion_soles: num(s('detraccion_soles')),
    retencion_igv: num(s('retencion_igv')),
    id_cotizacion: r['id_cotizacion'] as number | null,
    lineas: r['lineas'] as number,
  };
}

/** Lo que se reparte entre las cuotas: los montos de la orden (la detracción en su moneda y, aparte, la que se deposita en soles). */
export function montosDe(doc: DocContrato): MontosDocumento {
  return {
    total: doc.total,
    renta4ta: doc.renta_4ta,
    detraccion: doc.detraccion_porcentaje === null ? 0 : redondear((doc.total * doc.detraccion_porcentaje) / 100),
    detraccionSoles: doc.detraccion_soles,
    retencionIgv: doc.retencion_igv,
  };
}

// ───────────────────────────────────────────────────────────── cuotas

export interface CuotaFila extends CuotaCalculada {
  id: number;
  numero_documento: string | null;
  id_contrato: number;
  tipoBD: TipoCuotaBD;
  estado: EstadoCuota;
  fecha_corte: string | null;
  avance_pct: number | null;
  origen_monto: string;
  observaciones: string | null;
  motivo_monto: string | null;
  factura_numero: string | null;
  factura_fecha: string | null;
  factura_url: string | null;
  registrado_por: string | null;
  aprobado_por: string | null;
  aprobado_en: string | null;
  motivo_anulacion: string | null;
}

const CUOTA_SPEC = {
  id: I, numero_documento: TN, id_contrato: I, tipo: T, numero: I, estado: T, fecha_corte: TN, avance_pct: TN, origen_monto: T, observaciones: TN, motivo_monto: TN,
  valorizado: T, amortizacion: T, facturable: T, renta_4ta: T, detraccion: T, detraccion_soles: T, retencion_igv: T, garantia: T, descuentos: T, reajuste: T, neto: T,
  factura_numero: TN, factura_fecha: TN, factura_url: TN, registrado_por: TN, aprobado_por: TN, aprobado_en: TN, motivo_anulacion: TN,
} as const;

/** Cuotas del contrato (no anuladas), en orden: adelanto, valorizaciones y devolución de la garantía. */
export async function leerCuotas(sql: AlmacenSql, idContrato: number, tx?: Tx): Promise<CuotaFila[]> {
  const q = sqlTag(sql);
  const filas = await q.rows<Record<string, string | number | null>>(CUOTA_SPEC, tx)`
    SELECT id, numero_documento::text AS numero_documento, id_contrato, tipo::text AS tipo, numero, estado::text AS estado, fecha_corte::text AS fecha_corte,
           avance_pct::text AS avance_pct, origen_monto::text AS origen_monto, observaciones, motivo_monto,
           valorizado::text AS valorizado, amortizacion::text AS amortizacion, facturable::text AS facturable, renta_4ta::text AS renta_4ta,
           detraccion::text AS detraccion, detraccion_soles::text AS detraccion_soles, retencion_igv::text AS retencion_igv, garantia::text AS garantia,
           descuentos::text AS descuentos, reajuste::text AS reajuste, neto::text AS neto, factura_numero::text AS factura_numero, factura_fecha::text AS factura_fecha,
           factura_url::text AS factura_url, registrado_por::text AS registrado_por, aprobado_por::text AS aprobado_por,
           aprobado_en::text AS aprobado_en, motivo_anulacion
      FROM valorizacion WHERE id_contrato = ${idContrato}::int AND estado::text <> 'ANULADA'
     ORDER BY CASE tipo::text WHEN 'ADELANTO' THEN 0 WHEN 'VALORIZACION' THEN 1 ELSE 2 END, numero, id`;
  return filas.map((r) => {
    const s = (k: string) => r[k] as string | null;
    const tipoBD = s('tipo') as TipoCuotaBD;
    return {
      id: r['id'] as number,
      numero_documento: s('numero_documento'),
      id_contrato: r['id_contrato'] as number,
      tipoBD,
      tipo: tipoBD === 'ADELANTO' ? 'ADELANTO' : 'VALORIZACION',
      numero: r['numero'] as number,
      estado: s('estado') as EstadoCuota,
      fecha_corte: s('fecha_corte'),
      avance_pct: s('avance_pct') === null ? null : num(s('avance_pct')),
      origen_monto: s('origen_monto') ?? 'PLAN',
      observaciones: s('observaciones'),
      motivo_monto: s('motivo_monto'),
      valorizado: num(s('valorizado')),
      amortizacion: num(s('amortizacion')),
      facturable: num(s('facturable')),
      renta4ta: num(s('renta_4ta')),
      detraccion: num(s('detraccion')),
      detraccionSoles: num(s('detraccion_soles')),
      retencionIgv: num(s('retencion_igv')),
      garantia: num(s('garantia')),
      descuentos: num(s('descuentos')),
      reajuste: num(s('reajuste')),
      neto: num(s('neto')),
      factura_numero: s('factura_numero'),
      factura_fecha: s('factura_fecha'),
      factura_url: s('factura_url'),
      registrado_por: s('registrado_por'),
      aprobado_por: s('aprobado_por'),
      aprobado_en: s('aprobado_en'),
      motivo_anulacion: s('motivo_anulacion'),
    };
  });
}

/** Cuotas aprobadas que entran al cálculo del esquema (adelanto y valorizaciones; la devolución de la garantía no). */
export const aprobadasDelEsquema = (cuotas: readonly CuotaFila[]): CuotaFila[] => cuotas.filter((c) => c.estado === 'APROBADA' && c.tipoBD !== 'GARANTIA');

/** Garantía retenida a hoy: lo retenido en las cuotas aprobadas menos lo ya devuelto (la devolución guarda la garantía en negativo). */
export const garantiaRetenida = (cuotas: readonly CuotaFila[]): number => redondear(cuotas.filter((c) => c.estado === 'APROBADA').reduce((a, c) => a + c.garantia, 0));

// ───────────────────────────────────────────────────────────── líneas de la orden

export interface LineaOrdenFila {
  id: number;
  descripcion: string | null;
  codigo: string | null;
  unidad: string | null;
  cantidad: number;
  precio: number;
  monto: number;
  id_subfase: number | null;
  subfase: string | null;
}

export async function leerLineasOrden(sql: AlmacenSql, idDocumento: number, tx?: Tx): Promise<LineaOrdenFila[]> {
  const q = sqlTag(sql);
  const filas = await q.rows<Record<string, string | number | null>>(
    { id: I, descripcion: TN, codigo: TN, unidad: TN, cantidad: T, precio: T, monto: T, id_subfase: IN, subfase: TN },
    tx,
  )`
    SELECT od.id, p.descripcion::text AS descripcion, od."ProductoCodigo"::text AS codigo, COALESCE(u.simbolo, u.codigo)::text AS unidad,
           COALESCE(od."Cantidad", 0)::text AS cantidad, COALESCE(od."Precio", 0)::text AS precio, COALESCE(od.monto, 0)::text AS monto,
           COALESCE(od.id_ppto_detalle_categoria, rd.id_ppto_detalle_categoria) AS id_subfase,
           (SELECT fc."Descripcion"::text FROM "ppto_DetalleFasesCate" c JOIN "ppto_FasesCategorias" fc ON fc."IdpptoFaseCategoria" = c."IdpptoFaseCategoria"
             WHERE c.id = COALESCE(od.id_ppto_detalle_categoria, rd.id_ppto_detalle_categoria) LIMIT 1) AS subfase
      FROM "ordenCompraDetalle" od
      LEFT JOIN requerimiento_detalle rd ON rd.id = od.id_requerimiento_detalle
      LEFT JOIN producto p ON p.id = od.id_producto
      LEFT JOIN unidad_medida u ON u.id = p.id_unidad_medida
     WHERE od.id_orden_compra = ${idDocumento}::int ORDER BY od.id`;
  return filas.map((r) => ({
    id: r['id'] as number,
    descripcion: r['descripcion'] as string | null,
    codigo: r['codigo'] as string | null,
    unidad: r['unidad'] as string | null,
    cantidad: num(r['cantidad'] as string),
    precio: num(r['precio'] as string),
    monto: num(r['monto'] as string),
    id_subfase: r['id_subfase'] as number | null,
    subfase: r['subfase'] as string | null,
  }));
}

/** Lo valorizado antes de cada línea (suma de sus partes presentes en las valorizaciones aprobadas), en la unidad bruta de las cuotas. */
export async function montosAnterioresPorLinea(sql: AlmacenSql, idContrato: number, tx?: Tx): Promise<Map<number, number>> {
  const q = sqlTag(sql);
  const filas = await q.rows<{ id: number; monto: string }>({ id: I, monto: T }, tx)`
    SELECT l.id_orden_detalle AS id, SUM(l.monto_presente)::text AS monto
      FROM valorizacion_linea l JOIN valorizacion v ON v.id = l.id_valorizacion
     WHERE v.id_contrato = ${idContrato}::int AND v.estado::text = 'APROBADA'
     GROUP BY l.id_orden_detalle`;
  return new Map(filas.map((f) => [f.id, num(f.monto)]));
}

// ───────────────────────────────────────────────────────────── deductivos

export interface DeductivoFila {
  id: number;
  id_documento_origen: number;
  motivo: string;
  fecha: string;
  descripcion: string;
  monto: number;
  estado: 'PENDIENTE' | 'APLICADO' | 'ANULADO';
  id_almacen_detalle: number | null;
  cantidad: number | null;
  id_obra_incidencia: number | null;
  sustento_url: string | null;
  registrado_por: string | null;
  motivo_anulacion: string | null;
  /** Lo ya descontado en valorizaciones aprobadas. */
  aplicado: number;
  /** Lo que falta por descontar. */
  pendiente: number;
}

/** Deductivos de una orden con lo ya aplicado en valorizaciones aprobadas (las anuladas se liberan al anular la cuota). */
export async function leerDeductivos(sql: AlmacenSql, idDocumento: number, tx?: Tx): Promise<DeductivoFila[]> {
  const q = sqlTag(sql);
  const filas = await q.rows<Record<string, string | number | null>>(
    {
      id: I, id_documento_origen: I, motivo: T, fecha: T, descripcion: T, monto: T, estado: T, id_almacen_detalle: IN, cantidad: TN, id_obra_incidencia: IN,
      sustento_url: TN, registrado_por: TN, motivo_anulacion: TN, aplicado: T,
    },
    tx,
  )`
    SELECT d.id, d.id_documento_origen, d.motivo::text AS motivo, d.fecha::text AS fecha, d.descripcion::text AS descripcion, d.monto::text AS monto,
           d.estado::text AS estado, d.id_almacen_detalle, d.cantidad::text AS cantidad, d.id_obra_incidencia, d.sustento_url::text AS sustento_url,
           d.registrado_por::text AS registrado_por, d.motivo_anulacion,
           COALESCE((SELECT SUM(a.monto) FROM valorizacion_deductivo a JOIN valorizacion v ON v.id = a.id_valorizacion
                      WHERE a.id_deductivo = d.id AND v.estado::text = 'APROBADA'), 0)::text AS aplicado
      FROM deductivo_proveedor d WHERE d.id_documento_origen = ${idDocumento}::int ORDER BY d.fecha, d.id`;
  return filas.map((r) => {
    const monto = num(r['monto'] as string);
    const aplicado = num(r['aplicado'] as string);
    return {
      id: r['id'] as number,
      id_documento_origen: r['id_documento_origen'] as number,
      motivo: r['motivo'] as string,
      fecha: r['fecha'] as string,
      descripcion: r['descripcion'] as string,
      monto,
      estado: r['estado'] as DeductivoFila['estado'],
      id_almacen_detalle: r['id_almacen_detalle'] as number | null,
      cantidad: r['cantidad'] === null ? null : num(r['cantidad'] as string),
      id_obra_incidencia: r['id_obra_incidencia'] as number | null,
      sustento_url: r['sustento_url'] as string | null,
      registrado_por: r['registrado_por'] as string | null,
      motivo_anulacion: r['motivo_anulacion'] as string | null,
      aplicado,
      pendiente: Math.max(redondear(monto - aplicado), 0),
    };
  });
}

// ───────────────────────────────────────────────────────────── pagos

export interface PagoFila {
  id: number;
  numero: string;
  fecha_pago: string;
  concepto: string;
  monto: number;
  id_valorizacion: number | null;
}

/** Pagos registrados de la orden, con la cuota a la que se ligaron (por su programación), si la tienen. */
export async function leerPagos(sql: AlmacenSql, idDocumento: number, tx?: Tx): Promise<PagoFila[]> {
  const q = sqlTag(sql);
  const filas = await q.rows<Record<string, string | number | null>>({ id: I, numero: T, fecha_pago: T, concepto: T, monto: T, id_valorizacion: IN }, tx)`
    SELECT p.id, p.numero::text AS numero, p.fecha_pago::text AS fecha_pago, p.concepto::text AS concepto, p.monto::text AS monto, g.id_valorizacion
      FROM pago p LEFT JOIN pago_programado g ON g.id = p.id_pago_programado
     WHERE p.id_documento_origen = ${idDocumento}::int AND p.estado::text = 'REGISTRADO' ORDER BY p.fecha_pago, p.id`;
  return filas.map((r) => ({
    id: r['id'] as number,
    numero: r['numero'] as string,
    fecha_pago: r['fecha_pago'] as string,
    concepto: r['concepto'] as string,
    monto: num(r['monto'] as string),
    id_valorizacion: r['id_valorizacion'] as number | null,
  }));
}

/** ¿La orden tiene pagos o programaciones vivas? (por concepto o en total). */
export async function tieneMovimientoDePago(sql: AlmacenSql, idDocumento: number, tx?: Tx): Promise<boolean> {
  const q = sqlTag(sql);
  const [r] = await q.rows<{ n: number }>({ n: I }, tx)`
    SELECT ((SELECT count(*) FROM pago WHERE id_documento_origen = ${idDocumento}::int AND estado::text = 'REGISTRADO')
          + (SELECT count(*) FROM pago_programado WHERE id_documento_origen = ${idDocumento}::int AND estado::text IN ('PROGRAMADO', 'EJECUTADO')))::int AS n`;
  return (r?.n ?? 0) > 0;
}

/** ¿Hay pagos o programaciones ligados a esta cuota? */
export async function cuotaConMovimiento(sql: AlmacenSql, idCuota: number, tx?: Tx): Promise<boolean> {
  const q = sqlTag(sql);
  const [r] = await q.rows<{ n: number }>({ n: I }, tx)`
    SELECT ((SELECT count(*) FROM pago_programado WHERE id_valorizacion = ${idCuota}::int AND estado::text IN ('PROGRAMADO', 'EJECUTADO')))::int AS n`;
  return (r?.n ?? 0) > 0;
}

export { csv };
