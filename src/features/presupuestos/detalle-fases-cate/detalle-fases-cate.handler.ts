import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar, type Varchar255 } from '../../../platform/db/varchar-helpers.js';
import { AlmacenSql } from '../../almacen/shared/almacen-sql.js';
import { recalcularMeta } from '../shared/recalcular-meta.js';
import {
  CreatePptoDetalleFaseCateDto,
  ListPptoDetalleFaseCateQueryDto,
  PptoDetalleFaseCateResponseDto,
  UpdatePptoDetalleFaseCateDto,
} from './detalle-fases-cate.dto.js';

@Injectable()
export class PptoDetalleFasesCateHandler {
  private readonly logger = new Logger(PptoDetalleFasesCateHandler.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
  ) {}

  private async resolveCentroCostoId(dto: {
    id_centro_costo?: number;
  }): Promise<number | undefined> {
    return dto.id_centro_costo;
  }

  async list(query: ListPptoDetalleFaseCateQueryDto): Promise<Paginated<PptoDetalleFaseCateResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.ppto_DetalleFasesCate.orderBy((c) => c.id.asc());

    const collection = hasFilters(query)
      ? base.where((c) =>
          and(
            ...(query.IdPresupuesto ? [c.IdPresupuesto.eq(toVarchar(query.IdPresupuesto))] : []),
            ...(query.IdPresupuestoDetalle ? [c.IdPresupuestoDetalle.eq(toVarchar(query.IdPresupuestoDetalle))] : []),
            ...(query.IdpptoFaseCategoria ? [c.IdpptoFaseCategoria.eq(toVarchar(query.IdpptoFaseCategoria))] : []),
          ),
        )
      : base;

    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);

    return toPaginated(data as unknown as PptoDetalleFaseCateResponseDto[], total.total, page, pageSize);
  }

  async getById(idOrCode: string | number): Promise<PptoDetalleFaseCateResponseDto> {
    const numId = Number(idOrCode);
    const row = isNaN(numId)
      ? await this.db.orm.public.ppto_DetalleFasesCate.first({ IdPresupuestoDetalleCategoria: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_DetalleFasesCate.first({ id: numId });

    if (!row) throw new NotFoundException(`Detalle de categoria "${idOrCode}" no encontrado`);
    return row as unknown as PptoDetalleFaseCateResponseDto;
  }

  async create(dto: CreatePptoDetalleFaseCateDto): Promise<PptoDetalleFaseCateResponseDto> {
    try {
      const idCentroCosto = await this.resolveCentroCostoId(dto);
      const created = await this.db.orm.public.ppto_DetalleFasesCate.create({
        IdPresupuestoDetalleCategoria: toVarchar(dto.IdPresupuestoDetalleCategoria),
        IdPresupuesto: toVarchar(dto.IdPresupuesto),
        IdPresupuestoDetalle: toVarchar(dto.IdPresupuestoDetalle),
        IdpptoFaseCategoria: toVarchar(dto.IdpptoFaseCategoria),
        IdpptoFase: toVarchar(dto.IdpptoFase),
        id_empresa: dto.id_empresa, 
        CodCentroCto: toVarchar(dto.CodCentroCto),
        id_centro_costo: idCentroCosto,
        CostoDirecto: toDecimalString(dto.CostoDirecto ?? 0),
        Usuario: toVarchar(dto.Usuario),
        FechaCreacion: toVarchar(new Date().toISOString()),
      });
      await this.syncFaseCostoDirecto(dto.IdPresupuestoDetalle);
      await this.actualizarMeta(dto.IdPresupuesto);
      return created as unknown as PptoDetalleFaseCateResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdPresupuestoDetalleCategoria "${dto.IdPresupuestoDetalleCategoria}" ya existe`);
      throw error;
    }
  }

  async update(idOrCode: string | number, dto: UpdatePptoDetalleFaseCateDto): Promise<PptoDetalleFaseCateResponseDto> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_DetalleFasesCate.first({ IdPresupuestoDetalleCategoria: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_DetalleFasesCate.first({ id: numId });
    if (!current) throw new NotFoundException(`Detalle de categoria "${idOrCode}" no encontrado`);
    const id = current.id;
    const idCentroCosto = await this.resolveCentroCostoId(dto);
    const data: {
      IdPresupuestoDetalleCategoria?: Varchar255;
      IdPresupuesto?: Varchar255;
      IdPresupuestoDetalle?: Varchar255;
      IdpptoFaseCategoria?: Varchar255;
      IdpptoFase?: Varchar255;
      id_empresa?: number;
      id_categoria?: number;
      CodCentroCto?: Varchar255;
      id_centro_costo?: number;
      CostoDirecto?: string;
      Usuario?: Varchar255;
    } = {};
    if (dto.IdPresupuestoDetalleCategoria !== undefined) data.IdPresupuestoDetalleCategoria = toVarchar(dto.IdPresupuestoDetalleCategoria);
    if (dto.IdPresupuesto !== undefined) data.IdPresupuesto = toVarchar(dto.IdPresupuesto);
    if (dto.IdPresupuestoDetalle !== undefined) data.IdPresupuestoDetalle = toVarchar(dto.IdPresupuestoDetalle);
    if (dto.IdpptoFaseCategoria !== undefined) data.IdpptoFaseCategoria = toVarchar(dto.IdpptoFaseCategoria);
    if (dto.IdpptoFase !== undefined) data.IdpptoFase = toVarchar(dto.IdpptoFase);
    if (dto.id_empresa !== undefined) data.id_empresa = dto.id_empresa;
    if (dto.id_categoria !== undefined) data.id_categoria = dto.id_categoria; if (dto.CodCentroCto !== undefined) data.CodCentroCto = toVarchar(dto.CodCentroCto);
    if (idCentroCosto !== undefined) data.id_centro_costo = idCentroCosto;
    if (dto.CostoDirecto !== undefined) data.CostoDirecto = toDecimalString(dto.CostoDirecto);
    if (dto.Usuario !== undefined) data.Usuario = toVarchar(dto.Usuario);

    try {
      const row = await this.db.orm.public.ppto_DetalleFasesCate.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Detalle de categoria ${id} no encontrado`);
      await this.syncFaseCostoDirecto(current.IdPresupuestoDetalle ?? dto.IdPresupuestoDetalle);
      await this.actualizarMeta(current.IdPresupuesto);
      // Si cambió de presupuesto, también el de origen queda sin esta subfase.
      if (dto.IdPresupuesto !== undefined && dto.IdPresupuesto !== current.IdPresupuesto) await this.actualizarMeta(dto.IdPresupuesto);
      return row as unknown as PptoDetalleFaseCateResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdPresupuestoDetalleCategoria ya existe`);
      throw error;
    }
  }

  async remove(idOrCode: string | number): Promise<{ deleted: boolean; id: number; code: string | null }> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_DetalleFasesCate.first({ IdPresupuestoDetalleCategoria: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_DetalleFasesCate.first({ id: numId });
    if (!current) throw new NotFoundException(`Detalle de categoria "${idOrCode}" no encontrado`);
    await this.db.orm.public.ppto_DetalleFasesCate.where({ id: current.id }).delete();
    await this.syncFaseCostoDirecto(current.IdPresupuestoDetalle);
    await this.actualizarMeta(current.IdPresupuesto);
    return { deleted: true, id: current.id, code: current.IdPresupuestoDetalleCategoria };
  }

  /**
   * Plan 11: deja al día el Meta del presupuesto (la fase y el presupuesto suman el Meta efectivo de sus subfases). Igual que la
   * sincronización del Base, no bloquea la respuesta si falla; queda en el log y el siguiente cambio lo vuelve a calcular.
   */
  private async actualizarMeta(codigoPresupuesto?: string | null): Promise<void> {
    if (!codigoPresupuesto) return;
    try {
      await this.db.transaction((tx) => recalcularMeta(this.sql, tx, String(codigoPresupuesto)));
    } catch (error) {
      this.logger.warn(`No se pudo recalcular el Meta del presupuesto ${codigoPresupuesto}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private async syncFaseCostoDirecto(idPresupuestoDetalle?: string | null): Promise<void> {
    if (!idPresupuestoDetalle) return;
    try {
      const cates = await this.db.orm.public.ppto_DetalleFasesCate
        .where((c) => c.IdPresupuestoDetalle.eq(toVarchar(idPresupuestoDetalle)))
        .all();
      const sum = cates.reduce((acc, c) => acc + (Number(c.CostoDirecto) || 0), 0);
      await this.db.orm.public.ppto_DetalleFases
        .where((f) => f.IdPresupuestoDetalle.eq(toVarchar(idPresupuestoDetalle)))
        .update({
          CostoDirecto: toDecimalString(sum),
        });
    } catch {
      // Non-blocking sync
    }
  }
}

function hasFilters(query: ListPptoDetalleFaseCateQueryDto): boolean {
  return (
    query.IdPresupuesto !== undefined ||
    query.IdPresupuestoDetalle !== undefined ||
    query.IdpptoFaseCategoria !== undefined
  );
}
