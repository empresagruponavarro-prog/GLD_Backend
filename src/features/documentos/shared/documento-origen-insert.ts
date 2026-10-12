import { BadRequestException } from '@nestjs/common';
import { AlmacenSql, I, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { claveMoneda, tcVigente } from '../../tesoreria/shared/tipo-cambio.js';
import {
  IGV_PCT,
  SERIE_POR_CLASE,
  calcularTributos,
  esSoles,
  redondear,
  type ClaseDocumento,
} from '../../tesoreria/shared/tributos.js';

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

export interface LineaNuevoDocumento {
  idProducto: number;
  codigo: string;
  tipoProducto: string;
  cantidad: string;
  precio: string;
  idRequerimientoDetalle: number | null;
}

export interface NuevoDocumentoOrigen {
  clase: ClaseDocumento;
  /** PRODUCTO / SERVICIO para OC y OS; `null` en los demas. */
  tipoOc: string | null;
  idCentroCosto: number | null;
  idFase: number | null;
  idArea: number | null;
  idAnexo: number | null;
  idCategoria: number | null;
  /** YYYY-MM-DD */
  fechaEmision: string;
  formaPago: string | null;
  monedaId: string | null;
  monedaSimbolo: string | null;
  /** Base imponible (sin IGV). */
  monto: number;
  afectoIgv: boolean;
  diasCredito: number | null;
  fechaVencimiento: string | null;
  comentarios: string | null;
  idRequerimiento: number | null;
  idCotizacion: number | null;
  /** `undefined` = proponer (10 % en servicios sobre S/ 700); 0 = sin detraccion. */
  detraccionPorcentaje?: number | null;
  /** Retencion fijada a mano; `undefined` = calcular. */
  retencionManual?: number | null;
  renta4ta?: number;
  dsctoCompras?: number;
  dsctoIntervencion?: number;
  dsctoOtros?: number;
  lineas: LineaNuevoDocumento[];
}

/** Total (con IGV) en soles; exige tipo de cambio si el documento esta en otra moneda. */
export async function totalEnSoles(
  sql: AlmacenSql,
  tx: Tx,
  total: number,
  monedaId: string | null,
  monedaSimbolo: string | null,
  fecha: string,
): Promise<number> {
  if (esSoles(monedaId, monedaSimbolo)) return total;
  const clave = claveMoneda(monedaId, monedaSimbolo);
  const tc = await tcVigente(sql, clave, fecha, tx);
  if (!tc) {
    throw new BadRequestException(`Registre el tipo de cambio de ${clave} (tesoreria/tipo-cambio) antes de continuar`);
  }
  return redondear(total * Number(tc.venta));
}

/**
 * Inserta un documento de origen con su detalle dentro de `tx`: numero correlativo por clase,
 * IGV, detraccion y retencion automaticas (plan 06 §5.5.1).
 */
export async function insertarDocumentoOrigen(
  sql: AlmacenSql,
  ledger: InventarioLedger,
  tx: Tx,
  d: NuevoDocumentoOrigen,
): Promise<{ id: number; numero_documento: string }> {
  const q = sqlTag(sql);
  const numero = await ledger.siguienteNumero(tx, SERIE_POR_CLASE[d.clase]);
  const monto = redondear(d.monto);
  const igv = d.afectoIgv ? redondear((monto * IGV_PCT) / 100) : 0;
  const total = redondear(monto + igv);

  const [prov] = d.idAnexo
    ? await q.rows<{ ex: boolean }>({ ex: { codecId: 'pg/bool@1', nullable: false } }, tx)`
        SELECT COALESCE(exceptuado_retencion, false) AS ex FROM anexos WHERE id = ${d.idAnexo}::int`
    : [];
  const totalSoles = await totalEnSoles(sql, tx, total, d.monedaId, d.monedaSimbolo, d.fechaEmision);
  const trib = calcularTributos({
    clase: d.clase,
    afectoIgv: d.afectoIgv,
    total,
    totalSoles,
    proveedorExceptuado: prov?.ex ?? false,
    detraccionPorcentaje: d.detraccionPorcentaje,
    retencionManual: d.retencionManual,
  });

  const [anio, mes] = d.fechaEmision.split('-').map(Number);
  const [doc] = await q.rows<{ id: number }>({ id: I }, tx)`
    INSERT INTO "documentosOrigen" (
      tipo_costo, tipo_oc, numero_oc, id_centro_costo, id_categoria, id_fase, periodo, mes, id_anexo, fecha_emision,
      forma_pago, moneda_id, moneda_simbolo, monto, igv, renta_4ta, dscto_compras, dscto_intervencion, dscto_otros, total,
      comentarios, fecha_creacion, id_requerimiento, clase_documento, numero_documento, estado, id_area, afecto_igv,
      dias_credito, fecha_vencimiento, detraccion_porcentaje, detraccion_monto, retencion_porcentaje, retencion_monto,
      retencion_manual, id_cotizacion)
    VALUES (
      'REGULAR', NULLIF(${d.tipoOc ?? ''}::text, ''), ${numero}::text, NULLIF(${d.idCentroCosto ?? 0}::int, 0),
      NULLIF(${d.idCategoria ?? 0}::int, 0), NULLIF(${d.idFase ?? 0}::int, 0), ${String(anio)}::text, ${MESES[mes - 1]}::text,
      NULLIF(${d.idAnexo ?? 0}::int, 0), ${d.fechaEmision}::date::timestamptz,
      NULLIF(${d.formaPago ?? ''}::text, ''), NULLIF(${d.monedaId ?? ''}::text, ''), NULLIF(${d.monedaSimbolo ?? ''}::text, ''),
      ${String(monto)}::numeric, ${String(igv)}::numeric, ${String(d.renta4ta ?? 0)}::numeric, ${String(d.dsctoCompras ?? 0)}::numeric,
      ${String(d.dsctoIntervencion ?? 0)}::numeric, ${String(d.dsctoOtros ?? 0)}::numeric, ${String(total)}::numeric,
      NULLIF(${d.comentarios ?? ''}::text, ''), now(), NULLIF(${d.idRequerimiento ?? 0}::int, 0), ${d.clase}::text, ${numero}::text,
      'REGISTRADO', NULLIF(${d.idArea ?? 0}::int, 0), ${d.afectoIgv}::boolean,
      CASE WHEN ${d.diasCredito !== null}::boolean THEN ${d.diasCredito ?? 0}::int END,
      NULLIF(${d.fechaVencimiento ?? ''}::text, '')::date,
      CASE WHEN ${trib.detraccion_porcentaje !== null}::boolean THEN ${String(trib.detraccion_porcentaje ?? 0)}::numeric END,
      CASE WHEN ${trib.detraccion_monto !== null}::boolean THEN ${String(trib.detraccion_monto ?? 0)}::numeric END,
      CASE WHEN ${trib.retencion_porcentaje !== null}::boolean THEN ${String(trib.retencion_porcentaje ?? 0)}::numeric END,
      CASE WHEN ${trib.retencion_monto !== null}::boolean THEN ${String(trib.retencion_monto ?? 0)}::numeric END,
      ${trib.retencion_manual}::boolean, NULLIF(${d.idCotizacion ?? 0}::int, 0))
    RETURNING id`;

  for (const l of d.lineas) {
    const sub = redondear(Number(l.cantidad) * Number(l.precio));
    await q.run(tx)`
      INSERT INTO "ordenCompraDetalle" ("TipoProducto", "ProductoCodigo", "Cantidad", "Precio", monto, id_orden_compra,
                                        id_requerimiento_detalle, id_producto)
      VALUES (${l.tipoProducto}::text, ${l.codigo}::text, ${l.cantidad}::numeric, ${l.precio}::numeric, ${String(sub)}::numeric,
              ${doc.id}::int, NULLIF(${l.idRequerimientoDetalle ?? 0}::int, 0), ${l.idProducto}::int)`;
  }
  return { id: doc.id, numero_documento: numero };
}
