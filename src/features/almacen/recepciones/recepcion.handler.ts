import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { DocumentoHandler } from '../documentos/documento.handler.js';
import { CreateDocumentoDto, DocumentoResponseDto } from '../documentos/documento.dto.js';
import { AlmacenSql, B, I, IN, T, TN, sqlTag } from '../shared/almacen-sql.js';
import {
  CreateRecepcionDto,
  RecepcionNoRecibibleResponseDto,
  RecepcionOrdenCompraResponseDto,
  RecepcionPendienteResponseDto,
} from './recepcion.dto.js';

// Soles = simbolo vacio, "S/" o "S/." (los datos historicos mezclan ids de moneda), o moneda_id PEN.
// La condicion se repite en los SELECT porque un fragmento SQL no puede interpolarse en el tagged template.

@Injectable()
export class RecepcionHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly documentos: DocumentoHandler,
  ) {}

  /** OC con productos de catalogo pendientes de recibir. */
  async pendientes(search?: string): Promise<RecepcionPendienteResponseDto[]> {
    const q = sqlTag(this.sql);
    const patron = `%${search ?? ''}%`;
    return q.rows<RecepcionPendienteResponseDto>({
      id: I,
      id_oc: TN,
      numero_oc: TN,
      fecha_emision: TN,
      proveedor: TN,
      id_centro_costo: IN,
      centro_costo: TN,
      numero_requerimiento: TN,
      moneda_simbolo: TN,
      total: TN,
      lineas_pendientes: I,
    })`
      SELECT * FROM (
      SELECT o.id, o.id_oc::text AS id_oc, o.numero_oc::text AS numero_oc, o.fecha_emision::text AS fecha_emision,
             COALESCE(pr."NombreComercial", pr."Anexo")::text AS proveedor, o.id_centro_costo, cc.centro_costo::text AS centro_costo,
             r.numero::text AS numero_requerimiento, o.moneda_simbolo::text AS moneda_simbolo, o.total::text AS total,
             (SELECT count(*)::int FROM "ordenCompraDetalle" l
                JOIN producto p ON p.id = l.id_producto AND p.tipo_producto = 'PRODUCTO'
               WHERE l.id_orden_compra = o.id
                 AND COALESCE(l."Cantidad", 0) > COALESCE((
                       SELECT SUM(dd.cantidad) FROM almacen_documento_detalle dd
                         JOIN almacen_documento a ON a.id = dd.id_documento
                        WHERE dd.id_orden_compra_detalle = l.id AND a.estado = 'REGISTRADO'
                          AND a.naturaleza = 'INGRESO' AND a.motivo = 'COMPRA'), 0)) AS lineas_pendientes
        FROM "documentosOrigen" o
        LEFT JOIN anexos pr ON pr.id = o.id_anexo
        LEFT JOIN "CentroCostos" cc ON cc.id = o.id_centro_costo
        LEFT JOIN requerimiento r ON r.id = o.id_requerimiento
       WHERE (${patron}::text = '%%' OR o.numero_oc ILIKE ${patron}::text OR o.id_oc ILIKE ${patron}::text)
      ) t WHERE t.lineas_pendientes > 0
       ORDER BY t.id DESC
       LIMIT 500`;
  }

  /** Cabecera de la OC y sus lineas recibibles (solo PRODUCTO) con saldo; el resto se informa aparte. */
  async getOrdenCompra(id: number): Promise<RecepcionOrdenCompraResponseDto> {
    const q = sqlTag(this.sql);
    const [oc] = await q.rows<Omit<RecepcionOrdenCompraResponseDto, 'lineas' | 'no_recibibles'>>({
      id: I,
      id_oc: TN,
      numero_oc: TN,
      fecha_emision: TN,
      id_proveedor: IN,
      proveedor: TN,
      id_centro_costo: IN,
      centro_costo: TN,
      numero_requerimiento: TN,
      moneda_simbolo: TN,
      es_soles: B,
      total: TN,
    })`
      SELECT o.id, o.id_oc::text AS id_oc, o.numero_oc::text AS numero_oc, o.fecha_emision::text AS fecha_emision,
             o.id_anexo AS id_proveedor, COALESCE(pr."NombreComercial", pr."Anexo")::text AS proveedor,
             o.id_centro_costo, cc.centro_costo::text AS centro_costo, r.numero::text AS numero_requerimiento,
             o.moneda_simbolo::text AS moneda_simbolo,
             (COALESCE(o.moneda_simbolo, '') = '' OR upper(o.moneda_simbolo) LIKE 'S/%' OR upper(COALESCE(o.moneda_id, '')) = 'PEN') AS es_soles,
             o.total::text AS total
        FROM "documentosOrigen" o
        LEFT JOIN anexos pr ON pr.id = o.id_anexo
        LEFT JOIN "CentroCostos" cc ON cc.id = o.id_centro_costo
        LEFT JOIN requerimiento r ON r.id = o.id_requerimiento
       WHERE o.id = ${id}::int`;
    if (!oc) throw new NotFoundException(`Orden de compra ${id} no encontrada`);

    const lineas = await q.rows<RecepcionOrdenCompraResponseDto['lineas'][number]>({
      id_detalle: I,
      id_producto: I,
      codigo: T,
      descripcion: T,
      unidad: T,
      cantidad: T,
      recibida: T,
      saldo: T,
      precio: TN,
    })`
      SELECT l.id AS id_detalle, l.id_producto, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             COALESCE(u.simbolo, u.codigo)::text AS unidad, COALESCE(l."Cantidad", 0)::text AS cantidad,
             COALESCE(r.recibido, 0)::text AS recibida,
             GREATEST(COALESCE(l."Cantidad", 0) - COALESCE(r.recibido, 0), 0)::text AS saldo, l."Precio"::text AS precio
        FROM "ordenCompraDetalle" l
        JOIN producto p ON p.id = l.id_producto AND p.tipo_producto = 'PRODUCTO'
        JOIN unidad_medida u ON u.id = p.id_unidad_medida
        LEFT JOIN (
          SELECT dd.id_orden_compra_detalle AS id, SUM(dd.cantidad) AS recibido
            FROM almacen_documento_detalle dd JOIN almacen_documento a ON a.id = dd.id_documento
           WHERE a.estado = 'REGISTRADO' AND a.naturaleza = 'INGRESO' AND a.motivo = 'COMPRA'
           GROUP BY dd.id_orden_compra_detalle
        ) r ON r.id = l.id
       WHERE l.id_orden_compra = ${id}::int ORDER BY l.id`;

    const noRecibibles = await q.rows<RecepcionNoRecibibleResponseDto>({ id_detalle: I, descripcion: T, motivo: T })`
      SELECT l.id AS id_detalle, COALESCE(p.descripcion, l."ProductoCodigo", 'Sin descripción')::text AS descripcion,
             CASE WHEN p.id IS NULL THEN 'Sin producto en el catálogo'
                  ELSE 'Servicio: no ingresa a almacén' END::text AS motivo
        FROM "ordenCompraDetalle" l
        LEFT JOIN producto p ON p.id = l.id_producto
       WHERE l.id_orden_compra = ${id}::int AND (p.id IS NULL OR p.tipo_producto <> 'PRODUCTO') ORDER BY l.id`;

    return { ...oc, lineas, no_recibibles: noRecibibles };
  }

  /** Registra un ingreso COMPRA ligado a la OC. Todo ocurre en una transaccion con la OC bloqueada. */
  async recibir(dto: CreateRecepcionDto): Promise<DocumentoResponseDto> {
    const ids = dto.lineas.map((l) => l.id_orden_compra_detalle);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay líneas de OC repetidas en la recepción');
    for (const l of dto.lineas) {
      if (Number(l.cantidad) <= 0) throw new BadRequestException(`La cantidad de la línea ${l.id_orden_compra_detalle} debe ser mayor a 0`);
    }

    const idDocumento = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [oc] = await q.rows<{
        id: number;
        id_oc: string | null;
        numero_oc: string | null;
        id_anexo: number | null;
        id_centro_costo: number | null;
        es_soles: boolean;
        tipo_anexo: string | null;
      }>(
        { id: I, id_oc: TN, numero_oc: TN, id_anexo: IN, id_centro_costo: IN, es_soles: B, tipo_anexo: TN },
        tx,
      )`
        SELECT o.id, o.id_oc::text AS id_oc, o.numero_oc::text AS numero_oc, o.id_anexo, o.id_centro_costo,
               (COALESCE(o.moneda_simbolo, '') = '' OR upper(o.moneda_simbolo) LIKE 'S/%' OR upper(COALESCE(o.moneda_id, '')) = 'PEN') AS es_soles,
               (SELECT a."tipoAnexo"::text FROM anexos a WHERE a.id = o.id_anexo) AS tipo_anexo
          FROM "documentosOrigen" o WHERE o.id = ${dto.id_orden_compra}::int FOR UPDATE OF o`;
      if (!oc) throw new NotFoundException(`Orden de compra ${dto.id_orden_compra} no encontrada`);
      if (!oc.es_soles && dto.tipo_cambio === undefined) {
        throw new BadRequestException('La OC no está en soles: indique tipo_cambio para valorizar el ingreso');
      }
      if (dto.tipo_cambio !== undefined && Number(dto.tipo_cambio) <= 0) {
        throw new BadRequestException('tipo_cambio debe ser mayor a 0');
      }
      const tc = oc.es_soles ? '1' : (dto.tipo_cambio as string);

      const lineasDoc: CreateDocumentoDto['lineas'] = [];
      for (const l of dto.lineas) {
        const [linea] = await q.rows<{
          id_orden_compra: number | null;
          id_producto: number | null;
          tipo: string | null;
          precio: string | null;
          costo: string | null;
          cabe: boolean;
          saldo: string;
        }>(
          { id_orden_compra: IN, id_producto: IN, tipo: TN, precio: TN, costo: TN, cabe: B, saldo: T },
          tx,
        )`
          SELECT l.id_orden_compra, l.id_producto, p.tipo_producto::text AS tipo, l."Precio"::text AS precio,
                 ROUND(l."Precio" * ${tc}::numeric, 4)::text AS costo,
                 (${l.cantidad}::numeric <= COALESCE(l."Cantidad", 0) - COALESCE(r.recibido, 0)) AS cabe,
                 GREATEST(COALESCE(l."Cantidad", 0) - COALESCE(r.recibido, 0), 0)::text AS saldo
            FROM "ordenCompraDetalle" l
            LEFT JOIN producto p ON p.id = l.id_producto
            LEFT JOIN (
              SELECT dd.id_orden_compra_detalle AS id, SUM(dd.cantidad) AS recibido
                FROM almacen_documento_detalle dd JOIN almacen_documento a ON a.id = dd.id_documento
               WHERE a.estado = 'REGISTRADO' AND a.naturaleza = 'INGRESO' AND a.motivo = 'COMPRA'
               GROUP BY dd.id_orden_compra_detalle
            ) r ON r.id = l.id
           WHERE l.id = ${l.id_orden_compra_detalle}::int`;
        if (!linea || linea.id_orden_compra !== dto.id_orden_compra) {
          throw new BadRequestException(`La línea ${l.id_orden_compra_detalle} no pertenece a la OC ${dto.id_orden_compra}`);
        }
        if (linea.id_producto === null) {
          throw new BadRequestException(`La línea ${l.id_orden_compra_detalle} no tiene un producto del catálogo`);
        }
        if (linea.tipo !== 'PRODUCTO') {
          throw new BadRequestException(`La línea ${l.id_orden_compra_detalle} es un servicio y no ingresa a almacén`);
        }
        if (linea.costo === null) {
          throw new BadRequestException(`La línea ${l.id_orden_compra_detalle} no tiene precio; no se puede valorizar`);
        }
        if (!linea.cabe) {
          throw new BadRequestException(
            `La cantidad de la línea ${l.id_orden_compra_detalle} (${l.cantidad}) supera el saldo por recibir (${linea.saldo})`,
          );
        }
        lineasDoc.push({ id_producto: linea.id_producto, cantidad: l.cantidad, costo_unitario: linea.costo });
      }

      const documento: CreateDocumentoDto = {
        fecha: dto.fecha,
        motivo: 'COMPRA',
        id_almacen: dto.id_almacen,
        documento_referencia: (oc.numero_oc ?? oc.id_oc ?? `OC-${oc.id}`).slice(0, 50),
        id_proveedor: oc.tipo_anexo === 'Proveedor' && oc.id_anexo !== null ? oc.id_anexo : undefined,
        id_centro_costo: oc.id_centro_costo ?? undefined,
        id_recibido_por: dto.id_recibido_por,
        observaciones: dto.observaciones,
        lineas: lineasDoc,
      };
      return this.documentos.registrarEnTx(tx, 'INGRESO', documento, {
        idOrdenCompra: dto.id_orden_compra,
        idsDetalleOc: ids,
      });
    });
    return this.documentos.getById(idDocumento, 'INGRESO');
  }
}
