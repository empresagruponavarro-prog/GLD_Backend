import '../../../platform/db/temporal.js';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, or } from '@prisma/orm-postgres/orm-client';
import type { CodecTypes, Varchar } from '@prisma/orm-postgres/target/codec-types';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, T, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import {
  csv,
  estadoRecepcionPorOc,
  recibidoPorLinea,
  tieneRecepciones,
  type EstadoRecepcion,
} from '../../almacen/shared/oc-saldos.js';
import { toDecimalString, toVarchar, type Varchar255 } from '../../presupuestos/presupuestos.helpers.js';
import { bloquearRequerimiento } from '../../requerimientos/shared/requerimiento-eventos.js';
import { validarConsumoLinea } from '../../requerimientos/shared/requerimiento-saldos.js';
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

/** Cliente ORM; dentro de una transaccion se usa `tx.orm.public` con la misma forma. */
type Orm = Database['orm']['public'];

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
  id_requerimiento: number | null;
};

@Injectable()
export class DocumentosOrigenHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
  ) {}

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
    const [recepcionPorOc, furPorId] = await Promise.all([
      estadoRecepcionPorOc(this.sql, data.map((row) => row.id)),
      this.getNumerosRequerimiento(data.map((row) => row.id_requerimiento)),
    ]);
    const items = data.map((row) =>
      toResponse(row, {
        nombreFase: row.id_fase === null ? null : (fasesPorId.get(row.id_fase) ?? null),
        nombreCentroCosto:
          row.id_centro_costo === null ? null : (centrosPorId.get(row.id_centro_costo) ?? null),
        numeroRequerimiento: row.id_requerimiento === null ? null : (furPorId.get(row.id_requerimiento) ?? null),
        estadoRecepcion: recepcionPorOc.get(row.id) ?? null,
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

  private async getNombresAnexo(rows: DocumentoOrigenRow[]): Promise<Map<number, string>> {
    const ids = [
      ...new Set(rows.map((row) => row.id_anexo).filter((id): id is number => id !== null)),
    ];
    if (ids.length === 0) return new Map();

    const anexos = await this.db.orm.public.Anexos.where((a) => a.id.in(ids)).all();
    const result = new Map<number, string>();
    for (const anexo of anexos) {
      const name = anexo.NombreComercial ?? anexo.Anexo;
      if (name) result.set(anexo.id, name);
    }
    return result;
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
    const [detalles, centrosPorId, fasesPorId, anexosPorId] = await Promise.all([
      this.db.orm.public.OrdenCompraDetalle
        .where((d) => d.id_orden_compra.in(ocIds))
        .orderBy((d) => d.id.asc())
        .all(),
      this.getNombresCentroCosto(ocs),
      this.getNombresFase(ocs),
      this.getNombresAnexo(ocs),
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

    const umIds = [
      ...new Set(
        productos
          .map((p) => p.id_unidad_medida)
          .filter((id): id is number => id !== null),
      ),
    ];
    const unidades =
      umIds.length > 0
        ? await this.db.orm.public.unidad_medida.where((u) => u.id.in(umIds)).all()
        : [];
    const unidadPorId = new Map(unidades.map((u) => [u.id, u.simbolo ?? u.descripcion ?? "UND"]));
    const ocPorId = new Map(ocs.map((o) => [o.id, o]));

    return detalles.map((detalle) => {
      const oc = detalle.id_orden_compra !== null ? ocPorId.get(detalle.id_orden_compra) : undefined;
      const producto = detalle.ProductoCodigo
        ? productoPorCodigo.get(detalle.ProductoCodigo)
        : undefined;
      const unidadMedida = producto?.id_unidad_medida
        ? (unidadPorId.get(producto.id_unidad_medida) ?? "UND")
        : "UND";
      const nombreAnexo = oc?.id_anexo != null ? (anexosPorId.get(oc.id_anexo) ?? null) : null;

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
        nombre_anexo: nombreAnexo,
        unidad_medida: unidadMedida,
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

    return this.respuestaCompleta(row);
  }

  /** Arma la respuesta de detalle (nombres, lineas con saldos de recepcion y estado de recepcion). */
  private async respuestaCompleta(row: DocumentoOrigenRow): Promise<DocumentoOrigenResponseDto> {
    const [nombreFase, nombreCentroCosto, nombreCategoria, nombreAnexo, detalles, recepcionPorOc, furPorId] =
      await Promise.all([
        this.getNombreFase(row.id_fase),
        this.getNombreCentroCosto(row.id_centro_costo),
        this.getNombreCategoria(row.id_categoria),
        this.getNombreAnexo(row.id_anexo),
        this.getDetalles(row.id),
        estadoRecepcionPorOc(this.sql, [row.id]),
        this.getNumerosRequerimiento([row.id_requerimiento]),
      ]);

    return toResponse(row, {
      nombreFase,
      detalles,
      nombreCentroCosto,
      nombreCategoria,
      nombreAnexo,
      numeroRequerimiento: row.id_requerimiento === null ? null : (furPorId.get(row.id_requerimiento) ?? null),
      estadoRecepcion: recepcionPorOc.get(row.id) ?? null,
    });
  }

  private async getNumerosRequerimiento(ids: Array<number | null>): Promise<Map<number, string>> {
    const validos = ids.filter((id): id is number => id !== null);
    if (validos.length === 0) return new Map();
    const q = sqlTag(this.sql);
    const rows = await q.rows<{ id: number; numero: string }>({ id: I, numero: T })`
      SELECT id, numero::text AS numero FROM requerimiento
       WHERE id = ANY(string_to_array(${csv(validos)}::text, ',')::int[])`;
    return new Map(rows.map((r) => [r.id, r.numero]));
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
    if (dto.id_requerimiento === undefined) {
      if (detalles.some((d) => d.id_requerimiento_detalle !== undefined)) {
        throw new BadRequestException('id_requerimiento_detalle solo aplica cuando la OC tiene id_requerimiento');
      }
      const id = await this.crearOc(this.db.orm.public, dto);
      return this.getById(id);
    }

    // OC desde un FUR: el FUR se bloquea para que dos OC no consuman el mismo saldo a la vez.
    const idRequerimiento = dto.id_requerimiento;
    const id = await this.db.transaction(async (tx) => {
      const fur = await this.validarContraRequerimiento(tx, idRequerimiento, detalles, 0);
      const conDefaults: CreateDocumentoOrigenDto = {
        ...dto,
        id_centro_costo: dto.id_centro_costo ?? fur.id_centro_costo,
        id_fase: dto.id_fase ?? fur.id_fase ?? undefined,
      };
      return this.crearOc(tx.orm.public as unknown as Orm, conDefaults);
    });
    // La respuesta se arma despues del commit: dentro de la transaccion las lecturas por otra conexion no ven lo creado.
    return this.getById(id);
  }

  private async crearOc(orm: Orm, dto: CreateDocumentoOrigenDto): Promise<number> {
    const detalles = dto.detalles ?? [];
    await this.assertProductosExisten(detalles);
    const montos = this.calcularMontos(detalles, dto);
    const row = await orm.OrdenCompra.create({
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
      id_requerimiento: dto.id_requerimiento,
    });
    await this.createDetalles(orm, row.id, dto.id_oc, detalles);
    return row.id;
  }

  /**
   * Bloquea el FUR y valida que las lineas de la OC respeten su saldo aprobado.
   * `excluirOc` descuenta las lineas actuales de esa OC (para reemplazar su detalle).
   */
  private async validarContraRequerimiento(
    tx: Tx,
    idRequerimiento: number,
    detalles: CreateDocumentoOrigenDetalleDto[],
    excluirOc: number,
  ): Promise<{ id_centro_costo: number; id_fase: number | null }> {
    const fur = await bloquearRequerimiento(this.sql, tx, idRequerimiento);
    if (!fur) throw new BadRequestException(`Requerimiento ${idRequerimiento} no existe`);
    if (fur.estado !== 'APROBADO') {
      throw new ConflictException(`El requerimiento está ${fur.estado}; solo un requerimiento APROBADO genera órdenes de compra`);
    }
    if (detalles.length === 0) throw new BadRequestException('La OC de un requerimiento debe tener al menos una línea');

    const solicitadoPorLinea = new Map<number, number>();
    for (const d of detalles) {
      if (d.id_requerimiento_detalle === undefined) {
        throw new BadRequestException(`La línea del producto ${d.id_producto} debe indicar id_requerimiento_detalle`);
      }
      solicitadoPorLinea.set(
        d.id_requerimiento_detalle,
        Math.round(((solicitadoPorLinea.get(d.id_requerimiento_detalle) ?? 0) + d.cantidad) * 10000) / 10000,
      );
    }
    for (const d of detalles) {
      const idDetalle = d.id_requerimiento_detalle as number;
      const total = solicitadoPorLinea.get(idDetalle) as number;
      const linea = await validarConsumoLinea(this.sql, tx, idDetalle, total.toFixed(4), excluirOc);
      if (!linea || linea.id_requerimiento !== idRequerimiento) {
        throw new BadRequestException(`La línea ${idDetalle} no pertenece al requerimiento ${idRequerimiento}`);
      }
      if (linea.id_producto !== d.id_producto) {
        throw new BadRequestException(`La línea ${idDetalle} del requerimiento corresponde a otro producto`);
      }
      if (!linea.cabe) {
        const saldo = Math.max(Number(linea.aprobada) - Number(linea.ordenado), 0);
        throw new BadRequestException(
          `La cantidad ordenada (${total}) supera el saldo aprobado de la línea ${idDetalle} (${saldo})`,
        );
      }
    }
    return { id_centro_costo: fur.id_centro_costo, id_fase: fur.id_fase };
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
    orm: Orm,
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
      const created = await orm.OrdenCompraDetalle.create({
        id_orden_compra: idOrdenCompra,
        id_producto: producto.id,
        id_requerimiento_detalle: detalle.id_requerimiento_detalle,
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
        id_requerimiento_detalle: created.id_requerimiento_detalle,
        cantidad_recibida: null,
        saldo_por_recibir: null,
      });
    }
    return result;
  }

  async update(id: number, dto: UpdateDocumentoOrigenDto): Promise<DocumentoOrigenResponseDto> {
    const current = await this.db.orm.public.OrdenCompra.first({ id });
    if (!current) throw new NotFoundException(`Documento de origen ${id} no encontrado`);

    if (dto.id_requerimiento !== undefined && dto.id_requerimiento !== current.id_requerimiento) {
      throw new BadRequestException('El requerimiento de una OC no se puede cambiar');
    }
    const reemplazaDetalles = dto.detalles !== undefined;
    if (reemplazaDetalles) {
      await this.assertProductosExisten(dto.detalles);
      if (current.id_requerimiento === null && dto.detalles?.some((d) => d.id_requerimiento_detalle !== undefined)) {
        throw new BadRequestException('id_requerimiento_detalle solo aplica a OC que nacen de un requerimiento');
      }
    }

    await this.db.transaction(async (tx) => {
      await this.bloquearOc(tx, id);
      if (reemplazaDetalles) {
        if (await tieneRecepciones(this.sql, id, tx)) {
          throw new ConflictException('La OC ya tiene recepciones en almacén; su detalle no se puede reemplazar');
        }
        if (current.id_requerimiento !== null) {
          await this.validarContraRequerimiento(tx, current.id_requerimiento, dto.detalles ?? [], id);
        }
      }
      await this.aplicarUpdate(tx.orm.public as unknown as Orm, id, dto, current, reemplazaDetalles);
    });
    return this.getById(id);
  }

  private async aplicarUpdate(
    orm: Orm,
    id: number,
    dto: UpdateDocumentoOrigenDto,
    current: DocumentoOrigenRow,
    reemplazaDetalles: boolean,
  ): Promise<void> {
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

    const updated = await orm.OrdenCompra.where({ id }).update(data);
    if (!updated) throw new NotFoundException(`Documento de origen ${id} no encontrado`);

    if (reemplazaDetalles) {
      await orm.OrdenCompraDetalle.where((d) => d.id_orden_compra.eq(id)).delete();
      await this.createDetalles(orm, id, dto.id_oc ?? current.id_oc ?? undefined, dto.detalles);
    }
  }

  async delete(id: number): Promise<{ deleted: boolean; id: number }> {
    const current = await this.db.orm.public.OrdenCompra.first({ id });
    if (!current) throw new NotFoundException(`Documento de origen ${id} no encontrado`);
    await this.db.transaction(async (tx) => {
      await this.bloquearOc(tx, id);
      if (await tieneRecepciones(this.sql, id, tx)) {
        throw new ConflictException('La OC tiene recepciones en almacén; no se puede eliminar');
      }
      const orm = tx.orm.public as unknown as Orm;
      // Primero eliminar el detalle (FK); al borrar la OC se libera el saldo del requerimiento.
      await orm.OrdenCompraDetalle.where((d) => d.id_orden_compra.eq(id)).delete();
      await orm.OrdenCompra.where({ id }).delete();
    });
    return { deleted: true, id };
  }

  /** Bloquea la OC hasta el fin de la transaccion: serializa ediciones, bajas y recepciones. */
  private async bloquearOc(tx: Tx, id: number): Promise<void> {
    const q = sqlTag(this.sql);
    await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "documentosOrigen" WHERE id = ${id}::int FOR UPDATE`;
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

    const recibidoPorId = await recibidoPorLinea(this.sql, [idOrdenCompra]);
    return rows.map((r) => {
      const producto = r.ProductoCodigo ? productoPorCodigo.get(r.ProductoCodigo) : undefined;
      // Solo los productos del catalogo se reciben en almacen; servicios y lineas sin catalogo no tienen saldo.
      const recibible = producto !== undefined && producto.tipo_producto === 'PRODUCTO';
      const recibido = recibidoPorId.get(r.id) ?? '0';
      return {
        id: r.id,
        id_producto: producto?.id ?? null,
        producto_codigo: r.ProductoCodigo,
        producto_descripcion: producto?.descripcion ?? null,
        tipo_producto: r.TipoProducto,
        cantidad: r.Cantidad,
        precio: r.Precio,
        monto: r.monto,
        id_requerimiento_detalle: r.id_requerimiento_detalle,
        cantidad_recibida: recibible ? recibido : null,
        saldo_por_recibir: recibible ? restante(r.Cantidad, recibido) : null,
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
  numeroRequerimiento?: string | null;
  estadoRecepcion?: EstadoRecepcion | null;
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
    id_requerimiento: row.id_requerimiento,
    numero_requerimiento: extras.numeroRequerimiento ?? null,
    estado_recepcion: extras.estadoRecepcion ?? null,
    detalles: extras.detalles ?? [],
  };
}

/** `cantidad - recibido` (>= 0) como string con hasta 4 decimales; es solo para mostrar, la validacion real es en SQL. */
function restante(cantidad: string | null, recibido: string): string {
  const resto = Math.max(Number(cantidad ?? 0) - Number(recibido), 0);
  return String(Math.round(resto * 10000) / 10000);
}

function toIsoString(value: { toString(): string } | null): string | null {
  return value === null ? null : value.toString();
}

function toInstant(value: string | undefined): InstantInput | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const Temporal = (globalThis as { Temporal?: { Instant: { from(iso: string): unknown } } }).Temporal;
  if (!Temporal) throw new Error('Temporal no está disponible en este runtime');
  return Temporal.Instant.from(iso) as InstantInput;
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
