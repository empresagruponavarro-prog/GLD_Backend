import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { CodecTypes, Varchar } from '@prisma/orm-postgres/target/codec-types';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar, type Varchar255 } from '../../presupuestos/presupuestos.helpers.js';
import {
  CreateDocumentoOrigenDetalleDto,
  CreateDocumentoOrigenDto,
  DetallePorFaseQueryDto,
  DocumentoOrigenDetalleLineaResponseDto,
  DocumentoOrigenDetalleResponseDto,
  DocumentoOrigenResponseDto,
  ListDocumentosOrigenQueryDto,
  UpdateDocumentoOrigenDto,
} from './documentos-origen.dto.js';

/** Input del codec `pg/timestamptz-temporal@1`: un `Temporal.Instant`. */
type InstantInput = CodecTypes['pg/timestamptz-temporal@1']['input'];

type DocumentoOrigenUpdateData = Partial<{
  id_oc: Varchar255;
  tipo_costo: Varchar255;
  tipo_oc: Varchar255;
  numero_oc: Varchar255;
  id_centro_costo: number;
  id_categoria: number;
  id_fase: number;
  periodo: Varchar255;
  mes: Varchar255;
  id_anexo: number;
  fecha_emision: InstantInput;
  forma_pago: Varchar255;
  moneda_id: Varchar255;
  moneda_simbolo: Varchar255;
  monto: string;
  igv: string;
  renta_4ta: string;
  dscto_compras: string;
  dscto_intervencion: string;
  dscto_otros: string;
  total: string;
  comentarios: string;
  oc_pdf: Varchar255;
  usuario: Varchar255;
  fecha_creacion: InstantInput;
  hora_creacion: Varchar<10>;
  cotizacion: Varchar255;
}>;

type DocumentoOrigenRow = {
  id: number;
  id_oc: string | null;
  tipo_costo: string | null;
  tipo_oc: string | null;
  numero_oc: string | null;
  id_centro_costo: number | null;
  id_categoria: number | null;
  id_fase: number | null;
  periodo: string | null;
  mes: string | null;
  id_anexo: number | null;
  fecha_emision: { toString(): string } | null;
  forma_pago: string | null;
  moneda_id: string | null;
  moneda_simbolo: string | null;
  monto: string | null;
  igv: string | null;
  renta_4ta: string | null;
  dscto_compras: string | null;
  dscto_intervencion: string | null;
  dscto_otros: string | null;
  total: string | null;
  comentarios: string | null;
  oc_pdf: string | null;
  usuario: string | null;
  fecha_creacion: { toString(): string } | null;
  hora_creacion: string | null;
  cotizacion: string | null;
};

@Injectable()
export class DocumentosOrigenHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListDocumentosOrigenQueryDto): Promise<Paginated<DocumentoOrigenResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.OrdenCompra.orderBy((d) => d.id.desc());

    const collection = hasFilters(query)
      ? base.where((d) =>
          and(
            ...(query.search
              ? [or(d.id_oc.ilike(`%${query.search}%`), d.numero_oc.ilike(`%${query.search}%`))]
              : []),
            ...(query.tipo_oc ? [d.tipo_oc.eq(toVarchar(query.tipo_oc))] : []),
            ...(query.periodo ? [d.periodo.eq(toVarchar(query.periodo))] : []),
            ...(query.mes ? [d.mes.eq(toVarchar(query.mes))] : []),
            ...(query.id_centro_costo !== undefined ? [d.id_centro_costo.eq(query.id_centro_costo)] : []),
            ...(query.id_categoria !== undefined ? [d.id_categoria.eq(query.id_categoria)] : []),
            ...(query.id_fase !== undefined ? [d.id_fase.eq(query.id_fase)] : []),
            ...(query.id_anexo !== undefined ? [d.id_anexo.eq(query.id_anexo)] : []),
          ),
        )
      : base;

    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);

    const [fasesPorId, centrosPorId] = await Promise.all([
      this.getNombresFase(data),
      this.getNombresCentroCosto(data),
    ]);
    const items = data.map((row) =>
      toResponse(row, {
        nombreFase: row.id_fase === null ? null : (fasesPorId.get(row.id_fase) ?? null),
        nombreCentroCosto:
          row.id_centro_costo === null ? null : (centrosPorId.get(row.id_centro_costo) ?? null),
      }),
    );

    return toPaginated(items, total.total, page, pageSize);
  }

  private async getNombresCentroCosto(rows: DocumentoOrigenRow[]): Promise<Map<number, string>> {
    const ids = [
      ...new Set(rows.map((row) => row.id_centro_costo).filter((id): id is number => id !== null)),
    ];
    if (ids.length === 0) return new Map();

    const centros = await this.db.orm.public.CentroCostos.where((c) => c.id.in(ids)).all();
    const result = new Map<number, string>();
    for (const centro of centros) {
      if (centro.centro_costo !== null) result.set(centro.id, centro.centro_costo);
    }
    return result;
  }

  private async getNombreCentroCosto(idCentroCosto: number | null): Promise<string | null> {
    if (idCentroCosto === null) return null;
    const centro = await this.db.orm.public.CentroCostos.first({ id: idCentroCosto });
    return centro?.centro_costo ?? null;
  }

  private async getNombreCategoria(idCategoria: number | null): Promise<string | null> {
    if (idCategoria === null) return null;
    const categoria = await this.db.orm.public.categoria.first({ id: idCategoria });
    return categoria?.descripcion ?? categoria?.codigo ?? null;
  }

  private async getNombreAnexo(idAnexo: number | null): Promise<string | null> {
    if (idAnexo === null) return null;
    const anexo = await this.db.orm.public.Anexos.first({ id: idAnexo });
    return anexo?.Anexo ?? anexo?.NombreComercial ?? null;
  }

  async listDetallePorFase(
    query: DetallePorFaseQueryDto,
  ): Promise<DocumentoOrigenDetalleLineaResponseDto[]> {
    if (query.id_centro_costo === undefined && query.id_fase === undefined) return [];

    const ocs = await this.db.orm.public.OrdenCompra
      .where((o) =>
        and(
          ...(query.id_centro_costo !== undefined
            ? [o.id_centro_costo.eq(query.id_centro_costo)]
            : []),
          ...(query.id_fase !== undefined ? [o.id_fase.eq(query.id_fase)] : []),
        ),
      )
      .all();
    if (ocs.length === 0) return [];

    const ocIds = ocs.map((o) => o.id);
    const [detalles, centrosPorId, fasesPorId] = await Promise.all([
      this.db.orm.public.OrdenCompraDetalle
        .where((d) => d.id_orden_compra.in(ocIds))
        .orderBy((d) => d.id.asc())
        .all(),
      this.getNombresCentroCosto(ocs),
      this.getNombresFase(ocs),
    ]);

    const codigos = [
      ...new Set(
        detalles
          .map((d) => d.ProductoCodigo)
          .filter((c) => c !== null)
          .map((c) => String(c)),
      ),
    ];
    const productos =
      codigos.length > 0
        ? await this.db.orm.public.producto.where((p) => p.codigo.in(codigos)).all()
        : [];
    const productoPorCodigo = new Map(productos.map((p) => [p.codigo, p]));
    const ocPorId = new Map(ocs.map((o) => [o.id, o]));

    return detalles.map((detalle) => {
      const oc = detalle.id_orden_compra !== null ? ocPorId.get(detalle.id_orden_compra) : undefined;
      const producto = detalle.ProductoCodigo
        ? productoPorCodigo.get(detalle.ProductoCodigo)
        : undefined;
      return {
        id_documento: detalle.id_orden_compra ?? 0,
        id_oc: oc?.id_oc ?? null,
        numero_oc: oc?.numero_oc ?? null,
        id_centro_costo: oc?.id_centro_costo ?? null,
        nombre_centro_costo:
          oc?.id_centro_costo != null ? (centrosPorId.get(oc.id_centro_costo) ?? null) : null,
        id_fase: oc?.id_fase ?? null,
        nombre_fase: oc?.id_fase != null ? (fasesPorId.get(oc.id_fase) ?? null) : null,
        id_anexo: oc?.id_anexo ?? null,
        fecha_emision: oc ? toIsoString(oc.fecha_emision) : null,
        id_detalle: detalle.id,
        id_producto: producto?.id ?? null,
        producto_codigo: detalle.ProductoCodigo,
        producto_descripcion: producto?.descripcion ?? null,
        tipo_producto: detalle.TipoProducto,
        cantidad: detalle.Cantidad,
        precio: detalle.Precio,
        monto: detalle.monto,
      };
    });
  }

  async getById(id: number): Promise<DocumentoOrigenResponseDto> {
    const row = await this.db.orm.public.OrdenCompra.first({ id });
    if (!row) throw new NotFoundException(`Documento de origen ${id} no encontrado`);

    const [nombreFase, nombreCentroCosto, nombreCategoria, nombreAnexo, detalles] =
      await Promise.all([
        this.getNombreFase(row.id_fase),
        this.getNombreCentroCosto(row.id_centro_costo),
        this.getNombreCategoria(row.id_categoria),
        this.getNombreAnexo(row.id_anexo),
        this.getDetalles(row.id),
      ]);

    return toResponse(row, {
      nombreFase,
      detalles,
      nombreCentroCosto,
      nombreCategoria,
      nombreAnexo,
    });
  }

  private async getNombresFase(rows: DocumentoOrigenRow[]): Promise<Map<number, string>> {
    const ids = [
      ...new Set(rows.map((row) => row.id_fase).filter((id): id is number => id !== null)),
    ];
    if (ids.length === 0) return new Map();

    const fases = await this.db.orm.public.ppto_Fases.where((f) => f.id.in(ids)).all();
    const result = new Map<number, string>();
    for (const fase of fases) {
      if (fase.FaseProyecto !== null) result.set(fase.id, fase.FaseProyecto);
    }
    return result;
  }

  private async getNombreFase(idFase: number | null): Promise<string | null> {
    if (idFase === null) return null;
    const fase = await this.db.orm.public.ppto_Fases.first({ id: idFase });
    return fase?.FaseProyecto ?? null;
  }

  async create(dto: CreateDocumentoOrigenDto): Promise<DocumentoOrigenResponseDto> {
    const detalles = dto.detalles ?? [];
    await this.assertProductosExisten(detalles);
    const montos = this.calcularMontos(detalles, dto);
    const row = await this.db.orm.public.OrdenCompra.create({
      id_oc: toVarchar(dto.id_oc),
      tipo_costo: toVarchar(dto.tipo_costo),
      tipo_oc: toVarchar(dto.tipo_oc),
      numero_oc: toVarchar(dto.numero_oc),
      id_centro_costo: dto.id_centro_costo,
      id_categoria: dto.id_categoria,
      id_fase: dto.id_fase,
      periodo: toVarchar(dto.periodo),
      mes: toVarchar(dto.mes),
      id_anexo: dto.id_anexo,
      fecha_emision: toInstant(dto.fecha_emision),
      forma_pago: toVarchar(dto.forma_pago),
      moneda_id: toVarchar(dto.moneda_id),
      moneda_simbolo: toVarchar(dto.moneda_simbolo),
      monto: toDecimalString(montos.monto),
      igv: toDecimalString(montos.igv),
      renta_4ta: toDecimalString(montos.renta_4ta),
      dscto_compras: toDecimalString(montos.dscto_compras),
      dscto_intervencion: toDecimalString(montos.dscto_intervencion),
      dscto_otros: toDecimalString(montos.dscto_otros),
      total: toDecimalString(montos.total),
      comentarios: dto.comentarios,
      oc_pdf: toVarchar(dto.oc_pdf),
      usuario: toVarchar(dto.usuario),
      fecha_creacion: toInstant(dto.fecha_creacion),
      hora_creacion: toVarchar<10>(dto.hora_creacion),
      cotizacion: toVarchar(dto.cotizacion),
    });
    const detallesCreados = await this.createDetalles(row.id, dto.id_oc, detalles);
    return toResponse(row, {
      nombreFase: await this.getNombreFase(row.id_fase),
      detalles: detallesCreados,
      nombreCentroCosto: await this.getNombreCentroCosto(row.id_centro_costo),
      nombreCategoria: await this.getNombreCategoria(row.id_categoria),
      nombreAnexo: await this.getNombreAnexo(row.id_anexo),
    });
  }

  private calcularMontos(
    detalles: CreateDocumentoOrigenDetalleDto[],
    input: {
      igv?: number;
      renta_4ta?: number;
      dscto_compras?: number;
      dscto_intervencion?: number;
      dscto_otros?: number;
    },
  ): {
    monto: number;
    igv: number;
    renta_4ta: number;
    dscto_compras: number;
    dscto_intervencion: number;
    dscto_otros: number;
    total: number;
  } {
    const monto = detalles.reduce((acc, d) => acc + d.cantidad * d.precio, 0);
    const igv = input.igv ?? 0;
    const renta_4ta = input.renta_4ta ?? 0;
    const dscto_compras = input.dscto_compras ?? 0;
    const dscto_intervencion = input.dscto_intervencion ?? 0;
    const dscto_otros = input.dscto_otros ?? 0;
    const total = monto + igv - renta_4ta - dscto_compras - dscto_intervencion - dscto_otros;
    return { monto, igv, renta_4ta, dscto_compras, dscto_intervencion, dscto_otros, total };
  }

  private async assertProductosExisten(
    detalles: CreateDocumentoOrigenDetalleDto[] | undefined,
  ): Promise<void> {
    if (!detalles || detalles.length === 0) return;
    const ids = [...new Set(detalles.map((d) => d.id_producto))];
    const productos = await this.db.orm.public.producto.where((p) => p.id.in(ids)).all();
    const existentes = new Set(productos.map((p) => p.id));
    const faltantes = ids.filter((id) => !existentes.has(id));
    if (faltantes.length > 0) {
      throw new BadRequestException(`Producto(s) no encontrado(s): ${faltantes.join(', ')}`);
    }
  }

  private async createDetalles(
    idOrdenCompra: number,
    idOC: string | undefined,
    detalles: CreateDocumentoOrigenDetalleDto[] | undefined,
  ): Promise<DocumentoOrigenDetalleResponseDto[]> {
    if (!detalles || detalles.length === 0) return [];

    const ids = [...new Set(detalles.map((d) => d.id_producto))];
    const productos = await this.db.orm.public.producto.where((p) => p.id.in(ids)).all();
    const productoPorId = new Map(productos.map((p) => [p.id, p]));

    const faltantes = ids.filter((id) => !productoPorId.has(id));
    if (faltantes.length > 0) {
      throw new BadRequestException(`Producto(s) no encontrado(s): ${faltantes.join(', ')}`);
    }

    const result: DocumentoOrigenDetalleResponseDto[] = [];
    for (const detalle of detalles) {
      const producto = productoPorId.get(detalle.id_producto)!;
      const created = await this.db.orm.public.OrdenCompraDetalle.create({
        id_orden_compra: idOrdenCompra,
        IdOC: toVarchar(idOC),
        ProductoCodigo: toVarchar(producto.codigo),
        TipoProducto: producto.tipo_producto,
        Cantidad: toDecimalString(detalle.cantidad),
        Precio: toDecimalString(detalle.precio),
        monto: toDecimalString(detalle.cantidad * detalle.precio),
      });
      result.push({
        id: created.id,
        id_producto: producto.id,
        producto_codigo: created.ProductoCodigo,
        producto_descripcion: producto.descripcion,
        tipo_producto: created.TipoProducto,
        cantidad: created.Cantidad,
        precio: created.Precio,
        monto: created.monto,
      });
    }
    return result;
  }

  async update(id: number, dto: UpdateDocumentoOrigenDto): Promise<DocumentoOrigenResponseDto> {
    const current = await this.db.orm.public.OrdenCompra.first({ id });
    if (!current) throw new NotFoundException(`Documento de origen ${id} no encontrado`);

    const reemplazaDetalles = dto.detalles !== undefined;
    if (reemplazaDetalles) await this.assertProductosExisten(dto.detalles);

    const data: DocumentoOrigenUpdateData = {};
    if (dto.id_oc !== undefined) data.id_oc = toVarchar(dto.id_oc);
    if (dto.tipo_costo !== undefined) data.tipo_costo = toVarchar(dto.tipo_costo);
    if (dto.tipo_oc !== undefined) data.tipo_oc = toVarchar(dto.tipo_oc);
    if (dto.numero_oc !== undefined) data.numero_oc = toVarchar(dto.numero_oc);
    if (dto.id_centro_costo !== undefined) data.id_centro_costo = dto.id_centro_costo;
    if (dto.id_categoria !== undefined) data.id_categoria = dto.id_categoria;
    if (dto.id_fase !== undefined) data.id_fase = dto.id_fase;
    if (dto.periodo !== undefined) data.periodo = toVarchar(dto.periodo);
    if (dto.mes !== undefined) data.mes = toVarchar(dto.mes);
    if (dto.id_anexo !== undefined) data.id_anexo = dto.id_anexo;
    if (dto.fecha_emision !== undefined) data.fecha_emision = toInstant(dto.fecha_emision);
    if (dto.forma_pago !== undefined) data.forma_pago = toVarchar(dto.forma_pago);
    if (dto.moneda_id !== undefined) data.moneda_id = toVarchar(dto.moneda_id);
    if (dto.moneda_simbolo !== undefined) data.moneda_simbolo = toVarchar(dto.moneda_simbolo);
    if (dto.comentarios !== undefined) data.comentarios = dto.comentarios;
    if (dto.oc_pdf !== undefined) data.oc_pdf = toVarchar(dto.oc_pdf);
    if (dto.usuario !== undefined) data.usuario = toVarchar(dto.usuario);
    if (dto.fecha_creacion !== undefined) data.fecha_creacion = toInstant(dto.fecha_creacion);
    if (dto.hora_creacion !== undefined) data.hora_creacion = toVarchar<10>(dto.hora_creacion);
    if (dto.cotizacion !== undefined) data.cotizacion = toVarchar(dto.cotizacion);

    const monto = reemplazaDetalles
      ? (dto.detalles ?? []).reduce((acc, d) => acc + d.cantidad * d.precio, 0)
      : Number(current.monto ?? 0);
    const igv = dto.igv ?? Number(current.igv ?? 0);
    const renta_4ta = dto.renta_4ta ?? Number(current.renta_4ta ?? 0);
    const dscto_compras = dto.dscto_compras ?? Number(current.dscto_compras ?? 0);
    const dscto_intervencion = dto.dscto_intervencion ?? Number(current.dscto_intervencion ?? 0);
    const dscto_otros = dto.dscto_otros ?? Number(current.dscto_otros ?? 0);
    const total = monto + igv - renta_4ta - dscto_compras - dscto_intervencion - dscto_otros;

    data.monto = toDecimalString(monto);
    data.igv = toDecimalString(igv);
    data.renta_4ta = toDecimalString(renta_4ta);
    data.dscto_compras = toDecimalString(dscto_compras);
    data.dscto_intervencion = toDecimalString(dscto_intervencion);
    data.dscto_otros = toDecimalString(dscto_otros);
    data.total = toDecimalString(total);

    const row = await this.db.orm.public.OrdenCompra.where({ id }).update(data);
    if (!row) throw new NotFoundException(`Documento de origen ${id} no encontrado`);

    let detalles: DocumentoOrigenDetalleResponseDto[];
    if (reemplazaDetalles) {
      await this.db.orm.public.OrdenCompraDetalle
        .where((d) => d.id_orden_compra.eq(id))
        .delete();
      detalles = await this.createDetalles(
        id,
        dto.id_oc ?? current.id_oc ?? undefined,
        dto.detalles,
      );
    } else {
      detalles = await this.getDetalles(id);
    }

    return toResponse(row, {
      nombreFase: await this.getNombreFase(row.id_fase),
      detalles,
      nombreCentroCosto: await this.getNombreCentroCosto(row.id_centro_costo),
      nombreCategoria: await this.getNombreCategoria(row.id_categoria),
      nombreAnexo: await this.getNombreAnexo(row.id_anexo),
    });
  }

  private async getDetalles(idOrdenCompra: number): Promise<DocumentoOrigenDetalleResponseDto[]> {
    const rows = await this.db.orm.public.OrdenCompraDetalle
      .where((d) => d.id_orden_compra.eq(idOrdenCompra))
      .orderBy((d) => d.id.asc())
      .all();
    if (rows.length === 0) return [];

    const codigos = [
      ...new Set(
        rows
          .map((r) => r.ProductoCodigo)
          .filter((c) => c !== null)
          .map((c) => String(c)),
      ),
    ];
    const productos =
      codigos.length > 0
        ? await this.db.orm.public.producto.where((p) => p.codigo.in(codigos)).all()
        : [];
    const productoPorCodigo = new Map(productos.map((p) => [p.codigo, p]));

    return rows.map((r) => {
      const producto = r.ProductoCodigo ? productoPorCodigo.get(r.ProductoCodigo) : undefined;
      return {
        id: r.id,
        id_producto: producto?.id ?? null,
        producto_codigo: r.ProductoCodigo,
        producto_descripcion: producto?.descripcion ?? null,
        tipo_producto: r.TipoProducto,
        cantidad: r.Cantidad,
        precio: r.Precio,
        monto: r.monto,
      };
    });
  }
}

type ResponseExtras = {
  nombreFase?: string | null;
  detalles?: DocumentoOrigenDetalleResponseDto[];
  nombreCentroCosto?: string | null;
  nombreCategoria?: string | null;
  nombreAnexo?: string | null;
};

function toResponse(row: DocumentoOrigenRow, extras: ResponseExtras = {}): DocumentoOrigenResponseDto {
  return {
    id: row.id,
    id_oc: row.id_oc,
    tipo_costo: row.tipo_costo,
    tipo_oc: row.tipo_oc,
    numero_oc: row.numero_oc,
    id_centro_costo: row.id_centro_costo,
    nombre_centro_costo: extras.nombreCentroCosto ?? null,
    id_categoria: row.id_categoria,
    nombre_categoria: extras.nombreCategoria ?? null,
    id_fase: row.id_fase,
    nombre_fase: extras.nombreFase ?? null,
    periodo: row.periodo,
    mes: row.mes,
    id_anexo: row.id_anexo,
    nombre_anexo: extras.nombreAnexo ?? null,
    fecha_emision: toIsoString(row.fecha_emision),
    forma_pago: row.forma_pago,
    moneda_id: row.moneda_id,
    moneda_simbolo: row.moneda_simbolo,
    monto: row.monto,
    igv: row.igv,
    renta_4ta: row.renta_4ta,
    dscto_compras: row.dscto_compras,
    dscto_intervencion: row.dscto_intervencion,
    dscto_otros: row.dscto_otros,
    total: row.total,
    comentarios: row.comentarios,
    oc_pdf: row.oc_pdf,
    usuario: row.usuario,
    fecha_creacion: toIsoString(row.fecha_creacion),
    hora_creacion: row.hora_creacion,
    cotizacion: row.cotizacion,
    detalles: extras.detalles ?? [],
  };
}

function toIsoString(value: { toString(): string } | null): string | null {
  return value === null ? null : value.toString();
}

function toInstant(value: string | undefined): InstantInput | undefined {
  if (value === undefined) return undefined;
  const Temporal = (globalThis as { Temporal?: { Instant: { from(iso: string): unknown } } }).Temporal;
  if (!Temporal) throw new Error('Temporal no está disponible en este runtime');
  return Temporal.Instant.from(value) as InstantInput;
}

function hasFilters(query: ListDocumentosOrigenQueryDto): boolean {
  return (
    query.search !== undefined ||
    query.tipo_oc !== undefined ||
    query.periodo !== undefined ||
    query.mes !== undefined ||
    query.id_centro_costo !== undefined ||
    query.id_categoria !== undefined ||
    query.id_fase !== undefined ||
    query.id_anexo !== undefined
  );
}
