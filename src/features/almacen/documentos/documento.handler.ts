import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, IN, T, TN, sqlTag, type Tx } from '../shared/almacen-sql.js';
import { InventarioLedger, type MotivoMovimiento } from '../shared/inventario-ledger.js';
import {
  CreateDocumentoDto,
  DocumentoLineaResponseDto,
  DocumentoResponseDto,
  ListDocumentoQueryDto,
  MOTIVOS_INGRESO,
  MOTIVOS_SALIDA,
  MOTIVOS_TRANSFERENCIA,
  type Naturaleza,
} from './documento.dto.js';

/** Enlace opcional de un ingreso con su orden de compra (recepcion). `idsDetalleOc` va alineado con `dto.lineas`. */
export interface VinculoOrdenCompra {
  idOrdenCompra: number;
  idsDetalleOc?: number[];
}

const SERIE: Record<Naturaleza, string> = { INGRESO: 'ING', SALIDA: 'SAL', TRANSFERENCIA: 'TRF' };
const MOTIVOS_PERMITIDOS: Record<Naturaleza, readonly string[]> = {
  INGRESO: MOTIVOS_INGRESO,
  SALIDA: MOTIVOS_SALIDA,
  TRANSFERENCIA: MOTIVOS_TRANSFERENCIA,
};
const COSTO_OBLIGATORIO = new Set(['INVENTARIO_INICIAL', 'COMPRA', 'INGRESO_CLIENTE']);

const CABECERA_SPEC = {
  id: I,
  numero: T,
  naturaleza: T,
  motivo: T,
  fecha: T,
  id_almacen: I,
  almacen: T,
  id_almacen_destino: IN,
  almacen_destino: TN,
  documento_referencia: TN,
  id_proveedor: IN,
  proveedor: TN,
  id_centro_costo: IN,
  centro_costo: TN,
  id_recibido_por: IN,
  recibido_por: TN,
  id_solicitado_por: IN,
  solicitado_por: TN,
  id_entregado_a: IN,
  entregado_a: TN,
  motivo_trabajo: TN,
  observaciones: TN,
  estado: T,
  id_documento_anula: IN,
  id_orden_compra: IN,
  numero_oc: TN,
  created_at: T,
  total_lineas: I,
} as const;

@Injectable()
export class DocumentoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(naturaleza: Naturaleza, query: ListDocumentoQueryDto): Promise<Paginated<DocumentoResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const q = sqlTag(this.sql);
    const desde = query.desde ?? '1900-01-01';
    const hasta = query.hasta ?? '9999-12-31';
    const idAlm = query.id_almacen ?? 0;
    const motivo = query.motivo ?? '';
    const prov = query.id_proveedor ?? 0;
    const cc = query.id_centro_costo ?? 0;
    const estado = query.estado ?? '';

    const [count] = await q.rows<{ total: number }>({ total: I })`
      SELECT count(*)::int AS total FROM almacen_documento d
       WHERE d.naturaleza = ${naturaleza}
         AND d.fecha >= ${desde}::date AND d.fecha <= ${hasta}::date
         AND (${idAlm}::int = 0 OR d.id_almacen = ${idAlm}::int OR d.id_almacen_destino = ${idAlm}::int)
         AND (${motivo}::text = '' OR d.motivo = ${motivo}::text)
         AND (${prov}::int = 0 OR d.id_proveedor = ${prov}::int)
         AND (${cc}::int = 0 OR d.id_centro_costo = ${cc}::int)
         AND (${estado}::text = '' OR d.estado = ${estado}::text)`;

    const rows = await q.rows<Record<string, unknown>>(CABECERA_SPEC)`
      SELECT d.id, d.numero::text AS numero, d.naturaleza::text AS naturaleza, d.motivo::text AS motivo,
             d.fecha::text AS fecha, d.id_almacen, a.nombre AS almacen,
             d.id_almacen_destino, ad.nombre AS almacen_destino, d.documento_referencia::text AS documento_referencia,
             d.id_proveedor, COALESCE(pr."NombreComercial", pr."Anexo")::text AS proveedor,
             d.id_centro_costo, cc.centro_costo::text AS centro_costo,
             d.id_recibido_por, rp."Anexo"::text AS recibido_por,
             d.id_solicitado_por, sp."Anexo"::text AS solicitado_por,
             d.id_entregado_a, ea."Anexo"::text AS entregado_a,
             d.motivo_trabajo, d.observaciones, d.estado::text AS estado, d.id_documento_anula,
             d.id_orden_compra, oc.numero_oc::text AS numero_oc,
             d.created_at::text AS created_at,
             (SELECT count(*)::int FROM almacen_documento_detalle x WHERE x.id_documento = d.id) AS total_lineas
        FROM almacen_documento d
        JOIN almacen a ON a.id = d.id_almacen
        LEFT JOIN almacen ad ON ad.id = d.id_almacen_destino
        LEFT JOIN anexos pr ON pr.id = d.id_proveedor
        LEFT JOIN "CentroCostos" cc ON cc.id = d.id_centro_costo
        LEFT JOIN anexos rp ON rp.id = d.id_recibido_por
        LEFT JOIN anexos sp ON sp.id = d.id_solicitado_por
        LEFT JOIN anexos ea ON ea.id = d.id_entregado_a
        LEFT JOIN "documentosOrigen" oc ON oc.id = d.id_orden_compra
       WHERE d.naturaleza = ${naturaleza}
         AND d.fecha >= ${desde}::date AND d.fecha <= ${hasta}::date
         AND (${idAlm}::int = 0 OR d.id_almacen = ${idAlm}::int OR d.id_almacen_destino = ${idAlm}::int)
         AND (${motivo}::text = '' OR d.motivo = ${motivo}::text)
         AND (${prov}::int = 0 OR d.id_proveedor = ${prov}::int)
         AND (${cc}::int = 0 OR d.id_centro_costo = ${cc}::int)
         AND (${estado}::text = '' OR d.estado = ${estado}::text)
       ORDER BY d.fecha DESC, d.id DESC
       LIMIT ${pageSize}::int OFFSET ${offset}::int`;

    return toPaginated(rows as unknown as DocumentoResponseDto[], count.total, page, pageSize);
  }

  async getById(id: number, naturaleza?: Naturaleza): Promise<DocumentoResponseDto> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<Record<string, unknown>>(CABECERA_SPEC)`
      SELECT d.id, d.numero::text AS numero, d.naturaleza::text AS naturaleza, d.motivo::text AS motivo,
             d.fecha::text AS fecha, d.id_almacen, a.nombre AS almacen,
             d.id_almacen_destino, ad.nombre AS almacen_destino, d.documento_referencia::text AS documento_referencia,
             d.id_proveedor, COALESCE(pr."NombreComercial", pr."Anexo")::text AS proveedor,
             d.id_centro_costo, cc.centro_costo::text AS centro_costo,
             d.id_recibido_por, rp."Anexo"::text AS recibido_por,
             d.id_solicitado_por, sp."Anexo"::text AS solicitado_por,
             d.id_entregado_a, ea."Anexo"::text AS entregado_a,
             d.motivo_trabajo, d.observaciones, d.estado::text AS estado, d.id_documento_anula,
             d.id_orden_compra, oc.numero_oc::text AS numero_oc,
             d.created_at::text AS created_at,
             (SELECT count(*)::int FROM almacen_documento_detalle x WHERE x.id_documento = d.id) AS total_lineas
        FROM almacen_documento d
        JOIN almacen a ON a.id = d.id_almacen
        LEFT JOIN almacen ad ON ad.id = d.id_almacen_destino
        LEFT JOIN anexos pr ON pr.id = d.id_proveedor
        LEFT JOIN "CentroCostos" cc ON cc.id = d.id_centro_costo
        LEFT JOIN anexos rp ON rp.id = d.id_recibido_por
        LEFT JOIN anexos sp ON sp.id = d.id_solicitado_por
        LEFT JOIN anexos ea ON ea.id = d.id_entregado_a
        LEFT JOIN "documentosOrigen" oc ON oc.id = d.id_orden_compra
       WHERE d.id = ${id}::int`;
    if (!row || (naturaleza && row['naturaleza'] !== naturaleza)) {
      throw new NotFoundException(`Documento ${id} no encontrado`);
    }
    const lineas = await q.rows<Record<string, unknown>>({
      id: I,
      id_producto: I,
      codigo: T,
      descripcion: T,
      unidad: T,
      cantidad: T,
      costo_unitario: TN,
      observaciones: TN,
      id_orden_compra_detalle: IN,
    })`
      SELECT l.id, l.id_producto, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             COALESCE(u.simbolo, u.codigo)::text AS unidad, l.cantidad::text AS cantidad,
             l.costo_unitario::text AS costo_unitario, l.observaciones, l.id_orden_compra_detalle
        FROM almacen_documento_detalle l
        JOIN producto p ON p.id = l.id_producto
        JOIN unidad_medida u ON u.id = p.id_unidad_medida
       WHERE l.id_documento = ${id}::int ORDER BY l.id`;
    return { ...(row as unknown as DocumentoResponseDto), lineas: lineas as unknown as DocumentoLineaResponseDto[] };
  }

  // -------------------------------------------------------------- escritura

  async registrar(naturaleza: Naturaleza, dto: CreateDocumentoDto): Promise<DocumentoResponseDto> {
    const id = await this.db.transaction((tx) => this.registrarEnTx(tx, naturaleza, dto));
    return this.getById(id);
  }

  /**
   * Valida, inserta y aplica un documento dentro de una transaccion ya abierta (la usan las recepciones
   * de compra, que ademas bloquean la OC). Devuelve el id del documento creado.
   */
  async registrarEnTx(tx: Tx, naturaleza: Naturaleza, dto: CreateDocumentoDto, vinculo?: VinculoOrdenCompra): Promise<number> {
    this.validarEstructura(naturaleza, dto, vinculo !== undefined);
    await this.validarReferencias(tx, naturaleza, dto);
    return this.crearYAplicar(tx, naturaleza, dto, null, vinculo);
  }

  async anular(id: number, naturaleza: Naturaleza): Promise<DocumentoResponseDto> {
    const reversionId = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [doc] = await q.rows<{
        id: number;
        naturaleza: string;
        motivo: string;
        fecha: string;
        fecha_reversa: string;
        id_almacen: number;
        id_almacen_destino: number | null;
        estado: string;
        id_documento_anula: number | null;
        id_centro_costo: number | null;
      }>(
        {
          id: I,
          naturaleza: T,
          motivo: T,
          fecha: T,
          fecha_reversa: T,
          id_almacen: I,
          id_almacen_destino: IN,
          estado: T,
          id_documento_anula: IN,
          id_centro_costo: IN,
        },
        tx,
      )`SELECT id, naturaleza::text AS naturaleza, motivo::text AS motivo, fecha::text AS fecha,
                GREATEST(fecha, (now() AT TIME ZONE 'America/Lima')::date)::text AS fecha_reversa, id_almacen,
                id_almacen_destino, estado::text AS estado, id_documento_anula, id_centro_costo
           FROM almacen_documento WHERE id = ${id}::int FOR UPDATE`;
      if (!doc || doc.naturaleza !== naturaleza) throw new NotFoundException(`Documento ${id} no encontrado`);
      if (doc.estado === 'ANULADO') throw new ConflictException(`El documento ${id} ya está anulado`);
      if (doc.id_documento_anula !== null) throw new BadRequestException('No se puede anular un documento de reversión');

      const lineas = await q.rows<{ id_producto: number; cantidad: string; costo_unitario: string | null }>(
        { id_producto: I, cantidad: T, costo_unitario: TN },
        tx,
      )`SELECT id_producto, cantidad::text AS cantidad, costo_unitario::text AS costo_unitario
          FROM almacen_documento_detalle WHERE id_documento = ${id}::int ORDER BY id_producto`;

      // Documento inverso: ingreso <-> salida; la transferencia invierte los almacenes.
      const inverso: Naturaleza =
        naturaleza === 'INGRESO' ? 'SALIDA' : naturaleza === 'SALIDA' ? 'INGRESO' : 'TRANSFERENCIA';
      const motivo: MotivoMovimiento =
        naturaleza === 'INGRESO' ? 'AJUSTE_NEGATIVO' : naturaleza === 'SALIDA' ? 'AJUSTE_POSITIVO' : 'TRANSFERENCIA';
      const reversaDto: CreateDocumentoDto = {
        fecha: doc.fecha_reversa,
        motivo,
        id_almacen: naturaleza === 'TRANSFERENCIA' ? (doc.id_almacen_destino as number) : doc.id_almacen,
        id_almacen_destino: naturaleza === 'TRANSFERENCIA' ? doc.id_almacen : undefined,
        id_centro_costo: doc.id_centro_costo ?? undefined,
        observaciones: `Anulación del documento ${id}`,
        lineas: lineas.map((l) => ({
          id_producto: l.id_producto,
          cantidad: l.cantidad,
          costo_unitario: l.costo_unitario ?? undefined,
        })),
      };
      const nuevoId = await this.crearYAplicar(tx, inverso, reversaDto, {
        anula: id,
        costoReversa: naturaleza === 'INGRESO',
      });
      await q.run(tx)`UPDATE almacen_documento SET estado = 'ANULADO' WHERE id = ${id}::int`;
      return nuevoId;
    });
    void reversionId;
    return this.getById(id);
  }

  // ---------------------------------------------------------------- privado

  private validarEstructura(naturaleza: Naturaleza, dto: CreateDocumentoDto, permitirRepetidos = false): void {
    if (!MOTIVOS_PERMITIDOS[naturaleza].includes(dto.motivo)) {
      throw new BadRequestException(
        `El motivo ${dto.motivo} no es válido para ${naturaleza} (permitidos: ${MOTIVOS_PERMITIDOS[naturaleza].join(', ')})`,
      );
    }
    if (naturaleza === 'TRANSFERENCIA') {
      if (!dto.id_almacen_destino) throw new BadRequestException('id_almacen_destino es obligatorio en una transferencia');
      if (dto.id_almacen_destino === dto.id_almacen) {
        throw new BadRequestException('El almacén destino debe ser distinto del origen');
      }
    } else if (dto.id_almacen_destino) {
      throw new BadRequestException('id_almacen_destino solo aplica a transferencias');
    }
    const ids = dto.lineas.map((l) => l.id_producto);
    if (!permitirRepetidos && new Set(ids).size !== ids.length) {
      throw new BadRequestException('Hay productos repetidos en las líneas');
    }
    for (const l of dto.lineas) {
      if (Number(l.cantidad) <= 0) throw new BadRequestException(`La cantidad del producto ${l.id_producto} debe ser mayor a 0`);
      if (COSTO_OBLIGATORIO.has(dto.motivo) && l.costo_unitario === undefined) {
        throw new BadRequestException(`costo_unitario es obligatorio en ${dto.motivo} (producto ${l.id_producto})`);
      }
    }
  }

  private async validarReferencias(tx: Tx, naturaleza: Naturaleza, dto: CreateDocumentoDto): Promise<void> {
    const q = sqlTag(this.sql);
    const almacenes = [dto.id_almacen, ...(dto.id_almacen_destino ? [dto.id_almacen_destino] : [])];
    for (const idAlm of almacenes) {
      const [a] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM almacen WHERE id = ${idAlm}::int AND estado = true`;
      if (!a) throw new BadRequestException(`Almacén ${idAlm} no existe o está inactivo`);
    }
    const anexos: Array<[number | undefined, string, string]> = [
      [dto.id_proveedor, 'Proveedor', 'id_proveedor'],
      [dto.id_recibido_por, 'Trabajador', 'id_recibido_por'],
      [dto.id_solicitado_por, 'Trabajador', 'id_solicitado_por'],
      [dto.id_entregado_a, 'Trabajador', 'id_entregado_a'],
    ];
    for (const [idAnexo, tipo, campo] of anexos) {
      if (!idAnexo) continue;
      const [a] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM anexos WHERE id = ${idAnexo}::int AND "tipoAnexo" = ${tipo}`;
      if (!a) throw new BadRequestException(`${campo} (${idAnexo}) no es un Anexo de tipo ${tipo}`);
    }
    if (dto.id_centro_costo) {
      const [c] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "CentroCostos" WHERE id = ${dto.id_centro_costo}::int`;
      if (!c) throw new BadRequestException(`Centro de costos ${dto.id_centro_costo} no existe`);
    }
    void naturaleza;
  }

  /** Inserta cabecera + lineas y aplica el movimiento en el motor. Devuelve el id del documento. */
  private async crearYAplicar(
    tx: Tx,
    naturaleza: Naturaleza,
    dto: CreateDocumentoDto,
    reversa: { anula: number; costoReversa: boolean } | null,
    vinculo?: VinculoOrdenCompra,
  ): Promise<number> {
    const q = sqlTag(this.sql);
    const numero = await this.ledger.siguienteNumero(tx, SERIE[naturaleza]);
    const [doc] = await q.rows<{ id: number }>({ id: I }, tx)`
      INSERT INTO almacen_documento
        (numero, naturaleza, motivo, fecha, id_almacen, id_almacen_destino, documento_referencia, id_proveedor,
         id_centro_costo, id_recibido_por, id_solicitado_por, id_entregado_a, motivo_trabajo, observaciones, id_documento_anula,
         id_orden_compra)
      VALUES
        (${numero}, ${naturaleza}, ${dto.motivo}, ${dto.fecha}::date, ${dto.id_almacen}::int,
         NULLIF(${dto.id_almacen_destino ?? 0}::int, 0), NULLIF(${dto.documento_referencia ?? ''}::text, ''),
         NULLIF(${dto.id_proveedor ?? 0}::int, 0), NULLIF(${dto.id_centro_costo ?? 0}::int, 0),
         NULLIF(${dto.id_recibido_por ?? 0}::int, 0), NULLIF(${dto.id_solicitado_por ?? 0}::int, 0),
         NULLIF(${dto.id_entregado_a ?? 0}::int, 0), NULLIF(${dto.motivo_trabajo ?? ''}::text, ''),
         NULLIF(${dto.observaciones ?? ''}::text, ''), NULLIF(${reversa?.anula ?? 0}::int, 0),
         NULLIF(${vinculo?.idOrdenCompra ?? 0}::int, 0))
      RETURNING id`;

    // Lineas en el orden del usuario; el movimiento se aplica ordenado por producto (orden de bloqueo estable).
    const detalles: Array<{ idDetalle: number; linea: CreateDocumentoDto['lineas'][number] }> = [];
    for (const [i, linea] of dto.lineas.entries()) {
      const idDetalleOc = vinculo?.idsDetalleOc?.[i] ?? 0;
      const [d] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO almacen_documento_detalle (id_documento, id_producto, cantidad, costo_unitario, observaciones, id_orden_compra_detalle)
        VALUES (${doc.id}::int, ${linea.id_producto}::int, ${linea.cantidad}::numeric,
                CASE WHEN ${linea.costo_unitario !== undefined}::boolean THEN ${linea.costo_unitario ?? '0'}::numeric ELSE NULL END,
                NULLIF(${linea.observaciones ?? ''}::text, ''), NULLIF(${idDetalleOc}::int, 0))
        RETURNING id`;
      detalles.push({ idDetalle: d.id, linea });
    }
    detalles.sort((a, b) => a.linea.id_producto - b.linea.id_producto);

    for (const { idDetalle, linea } of detalles) {
      const prod = await this.ledger.bloquearProducto(tx, linea.id_producto);
      if (!reversa) {
        if (!prod.estado) throw new BadRequestException(`El producto "${prod.descripcion}" está inactivo`);
        if (prod.tipo !== 'PRODUCTO') throw new BadRequestException(`"${prod.descripcion}" es un servicio y no admite movimientos`);
        if (dto.motivo === 'COMPRA' && prod.estadoOperativo === 'DESCONTINUADO') {
          throw new BadRequestException(`"${prod.descripcion}" está descontinuado y no admite compras`);
        }
      }

      const mov = {
        idProducto: linea.id_producto,
        idAlmacen: dto.id_almacen,
        cantidad: linea.cantidad,
        fecha: dto.fecha,
        idDocumento: doc.id,
        idDocumentoDetalle: idDetalle,
        motivo: dto.motivo as MotivoMovimiento,
      };

      let costoAplicado: string;
      if (naturaleza === 'INGRESO') {
        if (dto.motivo === 'INVENTARIO_INICIAL' && !reversa) {
          const [previo] = await q.rows<{ n: number }>({ n: I }, tx)`
            SELECT 1 AS n FROM almacen_kardex
             WHERE id_producto = ${linea.id_producto}::int AND id_almacen = ${dto.id_almacen}::int LIMIT 1`;
          if (previo) {
            throw new ConflictException(
              `"${prod.descripcion}" ya tiene movimientos en el almacén ${dto.id_almacen}; el inventario inicial solo se registra una vez`,
            );
          }
        }
        const r = await this.ledger.registrarIngreso(tx, { ...mov, costo: linea.costo_unitario ?? null });
        costoAplicado = r.costo;
      } else if (naturaleza === 'SALIDA') {
        const r = await this.ledger.registrarEgreso(tx, {
          ...mov,
          costoReversa: reversa?.costoReversa ? (linea.costo_unitario ?? null) : null,
        });
        costoAplicado = r.costo;
      } else {
        const r = await this.ledger.registrarTransferencia(tx, {
          ...mov,
          idAlmacenDestino: dto.id_almacen_destino as number,
        });
        costoAplicado = r.costo;
      }
      await q.run(tx)`UPDATE almacen_documento_detalle SET costo_unitario = ${costoAplicado}::numeric WHERE id = ${idDetalle}::int`;
    }
    return doc.id;
  }
}
