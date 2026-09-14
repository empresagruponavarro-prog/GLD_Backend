import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar, type Varchar255 } from '../presupuestos.helpers.js';
import {
  CreatePptoDetalleFaseCateDto,
  ListPptoDetalleFaseCateQueryDto,
  PptoDetalleFaseCateResponseDto,
  UpdatePptoDetalleFaseCateDto,
} from './detalle-fases-cate.dto.js';

@Injectable()
export class PptoDetalleFasesCateHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

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

    if (!row) throw new NotFoundException(`Detalle de categoría "${idOrCode}" no encontrado`);
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
    if (!current) throw new NotFoundException(`Detalle de categoría "${idOrCode}" no encontrado`);
    const id = current.id;
    const idCentroCosto = await this.resolveCentroCostoId(dto);
    const data: {
      IdPresupuestoDetalleCategoria?: Varchar255;
      IdPresupuesto?: Varchar255;
      IdPresupuestoDetalle?: Varchar255;
      IdpptoFaseCategoria?: Varchar255;
      IdpptoFase?: Varchar255;
      id_empresa?: number;
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
    if (dto.CodCentroCto !== undefined) data.CodCentroCto = toVarchar(dto.CodCentroCto);
    if (idCentroCosto !== undefined) data.id_centro_costo = idCentroCosto;
    if (dto.CostoDirecto !== undefined) data.CostoDirecto = toDecimalString(dto.CostoDirecto);
    if (dto.Usuario !== undefined) data.Usuario = toVarchar(dto.Usuario);

    try {
      const row = await this.db.orm.public.ppto_DetalleFasesCate.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Detalle de categoría ${id} no encontrado`);
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
    if (!current) throw new NotFoundException(`Detalle de categoría "${idOrCode}" no encontrado`);
    await this.db.orm.public.ppto_DetalleFasesCate.where({ id: current.id }).delete();
    return { deleted: true, id: current.id, code: current.IdPresupuestoDetalleCategoria };
  }
}

function hasFilters(query: ListPptoDetalleFaseCateQueryDto): boolean {
  return (
    query.IdPresupuesto !== undefined ||
    query.IdPresupuestoDetalle !== undefined ||
    query.IdpptoFaseCategoria !== undefined
  );
}
