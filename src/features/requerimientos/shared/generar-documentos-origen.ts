import { BadRequestException } from '@nestjs/common';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { insertarDocumentoOrigen } from '../../documentos/shared/documento-origen-insert.js';
import { preciosOferta } from '../cotizaciones/cotizacion.handler.js';
import type { ClaseDocumento } from '../../tesoreria/shared/tributos.js';

export interface DocumentoGenerado {
  id: number;
  numero_documento: string;
  clase: string;
}

/** Clase de documento de origen que genera cada tipo de FUR que no es compra. */
const CLASE_POR_TIPO: Record<string, ClaseDocumento> = {
  PLANILLA_PERSONAL: 'PLANILLA_PERSONAL',
  PLANILLA_OBRA: 'PLANILLA_OBRA',
  CAJA_CHICA: 'CAJA_CHICA',
  GASTO_FINANCIERO: 'GASTO_FINANCIERO',
  PAGO_SERVICIO: 'PAGO_SERVICIO',
  OTRO: 'OTRO',
};

interface FurRow {
  id: number;
  numero: string;
  tipo: string;
  id_centro_costo: number;
  id_fase: number | null;
  id_area: number | null;
  id_beneficiario: number | null;
  justificacion: string;
  hoy: string;
}

interface LineaAprobada {
  id: number;
  id_producto: number;
  codigo: string;
  tipo_producto: string;
  id_categoria: number;
  aprobada: string;
  precio_referencial: string | null;
  id_beneficiario: number | null;
}

/**
 * Genera los documentos de origen de un FUR recien aprobado (dentro de la transaccion de aprobacion):
 * - COMPRA: una OC y/o una OS a nombre del proveedor ganador, con precios sin IGV de su cotizacion.
 * - Los demas tipos: un documento por beneficiario, de la clase que corresponde al tipo.
 */
export async function generarDocumentosOrigen(
  sql: AlmacenSql,
  ledger: InventarioLedger,
  tx: Tx,
  idRequerimiento: number,
  idCotizacionGanadora: number | null,
): Promise<DocumentoGenerado[]> {
  const q = sqlTag(sql);
  const [fur] = await q.rows<FurRow>(
    { id: I, numero: T, tipo: T, id_centro_costo: I, id_fase: IN, id_area: IN, id_beneficiario: IN, justificacion: T, hoy: T },
    tx,
  )`
    SELECT id, numero::text AS numero, tipo::text AS tipo, id_centro_costo, id_fase, id_area, id_beneficiario,
           justificacion, current_date::text AS hoy
      FROM requerimiento WHERE id = ${idRequerimiento}::int`;

  const lineas = await q.rows<LineaAprobada>(
    { id: I, id_producto: I, codigo: T, tipo_producto: T, id_categoria: I, aprobada: T, precio_referencial: TN, id_beneficiario: IN },
    tx,
  )`
    SELECT d.id, d.id_producto, p.codigo::text AS codigo, p.tipo_producto::text AS tipo_producto, p.id_categoria,
           d.cantidad_aprobada::text AS aprobada, d.precio_referencial::text AS precio_referencial, d.id_beneficiario
      FROM requerimiento_detalle d JOIN producto p ON p.id = d.id_producto
     WHERE d.id_requerimiento = ${idRequerimiento}::int AND COALESCE(d.cantidad_aprobada, 0) > 0 ORDER BY d.id`;

  if (fur.tipo === 'COMPRA') {
    if (idCotizacionGanadora === null) throw new BadRequestException('Indique la cotizacion ganadora (id_cotizacion_ganadora)');
    return generarCompra(sql, ledger, tx, fur, lineas, idCotizacionGanadora);
  }
  return generarNoCompra(sql, ledger, tx, fur, lineas);
}

async function generarCompra(
  sql: AlmacenSql,
  ledger: InventarioLedger,
  tx: Tx,
  fur: FurRow,
  lineas: LineaAprobada[],
  idCotizacion: number,
): Promise<DocumentoGenerado[]> {
  const q = sqlTag(sql);
  const [cot] = await q.rows<{
    id: number;
    id_proveedor: number;
    fecha: string;
    moneda_id: string;
    moneda_simbolo: string | null;
    incluye_igv: boolean;
    afecto_igv: boolean;
    forma_pago: string;
    dias_credito: number;
  }>({ id: I, id_proveedor: I, fecha: T, moneda_id: T, moneda_simbolo: TN, incluye_igv: B, afecto_igv: B, forma_pago: T, dias_credito: I }, tx)`
    SELECT id, id_proveedor, fecha::text AS fecha, moneda_id::text AS moneda_id, moneda_simbolo::text AS moneda_simbolo,
           incluye_igv, afecto_igv, forma_pago::text AS forma_pago, dias_credito
      FROM cotizacion WHERE id = ${idCotizacion}::int AND id_requerimiento = ${fur.id}::int`;
  if (!cot) throw new BadRequestException(`La cotizacion ${idCotizacion} no pertenece al requerimiento ${fur.id}`);

  const ofertas = await q.rows<{ id_requerimiento_detalle: number; cotiza: boolean; cantidad: string; precio_unitario: string }>(
    { id_requerimiento_detalle: I, cotiza: B, cantidad: T, precio_unitario: T },
    tx,
  )`
    SELECT id_requerimiento_detalle, cotiza, cantidad::text AS cantidad, precio_unitario::text AS precio_unitario
      FROM cotizacion_detalle WHERE id_cotizacion = ${idCotizacion}::int`;
  const oferta = new Map(ofertas.map((o) => [o.id_requerimiento_detalle, o]));

  const preparadas = lineas.map((l) => {
    const o = oferta.get(l.id);
    if (!o || !o.cotiza) {
      throw new BadRequestException(
        `La cotizacion ganadora no ofrece la linea ${l.codigo}; apruebela en 0 o elija otra cotizacion`,
      );
    }
    if (Number(l.aprobada) > Number(o.cantidad)) {
      throw new BadRequestException(`La cantidad aprobada de ${l.codigo} (${l.aprobada}) supera la cotizada (${o.cantidad})`);
    }
    const sin = preciosOferta(Number(o.precio_unitario), cot.incluye_igv, cot.afecto_igv).sin;
    return { linea: l, precio: sin.toFixed(4) };
  });

  const generados: DocumentoGenerado[] = [];
  for (const [tipoProducto, clase] of [
    ['PRODUCTO', 'ORDEN_COMPRA'],
    ['SERVICIO', 'ORDEN_SERVICIO'],
  ] as const) {
    const grupo = preparadas.filter((p) => p.linea.tipo_producto === tipoProducto);
    if (grupo.length === 0) continue;
    const monto = grupo.reduce((a, p) => a + Number(p.linea.aprobada) * Number(p.precio), 0);
    const doc = await insertarDocumentoOrigen(sql, ledger, tx, {
      clase,
      tipoOc: tipoProducto,
      idCentroCosto: fur.id_centro_costo,
      idFase: fur.id_fase,
      idArea: fur.id_area,
      idAnexo: cot.id_proveedor,
      idCategoria: grupo[0].linea.id_categoria,
      fechaEmision: fur.hoy,
      formaPago: cot.forma_pago,
      monedaId: cot.moneda_id,
      monedaSimbolo: cot.moneda_simbolo,
      monto,
      afectoIgv: cot.afecto_igv,
      diasCredito: cot.dias_credito,
      fechaVencimiento: null,
      comentarios: `Generado desde ${fur.numero}`,
      idRequerimiento: fur.id,
      idCotizacion: cot.id,
      lineas: grupo.map((p) => ({
        idProducto: p.linea.id_producto,
        codigo: p.linea.codigo,
        tipoProducto,
        cantidad: p.linea.aprobada,
        precio: p.precio,
        idRequerimientoDetalle: p.linea.id,
      })),
    });
    generados.push({ ...doc, clase });
  }
  return generados;
}

async function generarNoCompra(
  sql: AlmacenSql,
  ledger: InventarioLedger,
  tx: Tx,
  fur: FurRow,
  lineas: LineaAprobada[],
): Promise<DocumentoGenerado[]> {
  const clase = CLASE_POR_TIPO[fur.tipo];
  if (!clase) throw new BadRequestException(`Tipo de requerimiento ${fur.tipo} no genera documentos de origen`);

  // Un documento por beneficiario (planilla por trabajador) o uno solo si todas las lineas comparten beneficiario.
  const porBeneficiario = new Map<number, LineaAprobada[]>();
  for (const l of lineas) {
    const b = l.id_beneficiario ?? fur.id_beneficiario;
    if (!b) throw new BadRequestException(`La linea ${l.codigo} no tiene beneficiario`);
    porBeneficiario.set(b, [...(porBeneficiario.get(b) ?? []), l]);
  }

  const generados: DocumentoGenerado[] = [];
  for (const [beneficiario, grupo] of porBeneficiario) {
    const monto = grupo.reduce((a, l) => a + Number(l.aprobada) * Number(l.precio_referencial ?? 0), 0);
    if (monto <= 0) throw new BadRequestException('El importe aprobado debe ser mayor a 0');
    const doc = await insertarDocumentoOrigen(sql, ledger, tx, {
      clase,
      tipoOc: null,
      idCentroCosto: fur.id_centro_costo,
      idFase: fur.id_fase,
      idArea: fur.id_area,
      idAnexo: beneficiario,
      idCategoria: grupo[0].id_categoria,
      fechaEmision: fur.hoy,
      formaPago: null,
      monedaId: 'PEN',
      monedaSimbolo: 'S/',
      monto,
      // Planillas, caja chica y gastos financieros no cobran IGV; servicios y otros se registran sin IGV por defecto
      // y el usuario puede ajustar el documento despues si el comprobante lo trae.
      afectoIgv: false,
      diasCredito: null,
      fechaVencimiento: null,
      comentarios: `${fur.numero}: ${fur.justificacion}`,
      idRequerimiento: fur.id,
      idCotizacion: null,
      lineas: grupo.map((l) => ({
        idProducto: l.id_producto,
        codigo: l.codigo,
        tipoProducto: l.tipo_producto,
        cantidad: l.aprobada,
        precio: l.precio_referencial ?? '0',
        idRequerimientoDetalle: l.id,
      })),
    });
    generados.push({ ...doc, clase });
  }
  return generados;
}
