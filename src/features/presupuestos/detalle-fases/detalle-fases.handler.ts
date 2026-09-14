import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar, type Varchar255 } from '../presupuestos.helpers.js';
import {
  CreatePptoDetalleFaseDto,
  ListPptoDetalleFaseQueryDto,
  PptoDetalleFaseResponseDto,
  UpdatePptoDetalleFaseDto,
} from './detalle-fases.dto.js';

@Injectable()
export class PptoDetalleFasesHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async resolveCentroCostoId(dto: {
    id_centro_costo?: number;
  }): Promise<number | undefined> {
    return dto.id_centro_costo;
  }

  async list(query: ListPptoDetalleFaseQueryDto): Promise<Paginated<PptoDetalleFaseResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.ppto_DetalleFases.orderBy((d) => d.id.asc());

    const collection = hasFilters(query)
      ? base.where((d) =>
          and(
            ...(query.IdPresupuesto ? [d.IdPresupuesto.eq(toVarchar(query.IdPresupuesto))] : []),
            ...(query.IdpptoFase ? [d.IdpptoFase.eq(toVarchar(query.IdpptoFase))] : []),
          ),
        )
      : base;

    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);

    return toPaginated(data as unknown as PptoDetalleFaseResponseDto[], total.total, page, pageSize);
  }

  async getById(idOrCode: string | number): Promise<PptoDetalleFaseResponseDto> {
    const numId = Number(idOrCode);
    const row = isNaN(numId)
      ? await this.db.orm.public.ppto_DetalleFases.first({ IdPresupuestoDetalle: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_DetalleFases.first({ id: numId });

    if (!row) throw new NotFoundException(`Detalle de fase "${idOrCode}" no encontrado`);
    return row as unknown as PptoDetalleFaseResponseDto;
  }

  async create(dto: CreatePptoDetalleFaseDto): Promise<PptoDetalleFaseResponseDto> {
    try {
      const idCentroCosto = await this.resolveCentroCostoId(dto);
      const created = await this.db.orm.public.ppto_DetalleFases.create({
        IdPresupuestoDetalle: toVarchar(dto.IdPresupuestoDetalle),
        IdPresupuesto: toVarchar(dto.IdPresupuesto),
        IdpptoFase: toVarchar(dto.IdpptoFase),
        id_empresa: dto.id_empresa,
        CodCentroCtoPrincipal: toVarchar(dto.CodCentroCtoPrincipal),
        CodCentroCto: toVarchar(dto.CodCentroCto),
        id_centro_costo: idCentroCosto,
        CostoDirecto: toDecimalString(dto.CostoDirecto ?? 0),
        Usuario: toVarchar(dto.Usuario),
        FechaCreacion: toVarchar(new Date().toISOString()),
      });
      return created as unknown as PptoDetalleFaseResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdPresupuestoDetalle "${dto.IdPresupuestoDetalle}" ya existe`);
      throw error;
    }
  }

  async update(idOrCode: string | number, dto: UpdatePptoDetalleFaseDto): Promise<PptoDetalleFaseResponseDto> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_DetalleFases.first({ IdPresupuestoDetalle: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_DetalleFases.first({ id: numId });
    if (!current) throw new NotFoundException(`Detalle de fase "${idOrCode}" no encontrado`);
    const id = current.id;
    const idCentroCosto = await this.resolveCentroCostoId(dto);
    const data: {
      IdPresupuestoDetalle?: Varchar255;
      IdPresupuesto?: Varchar255;
      IdpptoFase?: Varchar255;
      id_empresa?: number;
      CodCentroCtoPrincipal?: Varchar255;
      CodCentroCto?: Varchar255;
      id_centro_costo?: number;
      CostoDirecto?: string;
      Usuario?: Varchar255;
    } = {};
    if (dto.IdPresupuestoDetalle !== undefined) data.IdPresupuestoDetalle = toVarchar(dto.IdPresupuestoDetalle);
    if (dto.IdPresupuesto !== undefined) data.IdPresupuesto = toVarchar(dto.IdPresupuesto);
    if (dto.IdpptoFase !== undefined) data.IdpptoFase = toVarchar(dto.IdpptoFase);
    if (dto.id_empresa !== undefined) data.id_empresa = dto.id_empresa;
    if (dto.CodCentroCtoPrincipal !== undefined) data.CodCentroCtoPrincipal = toVarchar(dto.CodCentroCtoPrincipal);
    if (dto.CodCentroCto !== undefined) data.CodCentroCto = toVarchar(dto.CodCentroCto);
    if (idCentroCosto !== undefined) data.id_centro_costo = idCentroCosto;
    if (dto.CostoDirecto !== undefined) data.CostoDirecto = toDecimalString(dto.CostoDirecto);
    if (dto.Usuario !== undefined) data.Usuario = toVarchar(dto.Usuario);

    try {
      const row = await this.db.orm.public.ppto_DetalleFases.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Detalle de fase ${id} no encontrado`);
      return row as unknown as PptoDetalleFaseResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdPresupuestoDetalle ya existe`);
      throw error;
    }
  }

  async remove(idOrCode: string | number): Promise<{ deleted: boolean; id: number; code: string | null }> {
    const numId = Number(idOrCode);
    const row = isNaN(numId)
      ? await this.db.orm.public.ppto_DetalleFases.first({ IdPresupuestoDetalle: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_DetalleFases.first({ id: numId });
    if (!row) throw new NotFoundException(`Detalle de fase "${idOrCode}" no encontrado`);

    if (row.IdPresupuestoDetalle) {
      await this.db.orm.public.ppto_DetalleFasesCate
        .where((c) => c.IdPresupuestoDetalle.eq(toVarchar(row.IdPresupuestoDetalle!)))
        .delete();
    }

    await this.db.orm.public.ppto_DetalleFases.where({ id: row.id }).delete();
    return { deleted: true, id: row.id, code: row.IdPresupuestoDetalle };
  }

  async getCategorias(idPresupuestoDetalle: string) {
    return this.db.orm.public.ppto_DetalleFasesCate
      .where((c) => c.IdPresupuestoDetalle.eq(toVarchar(idPresupuestoDetalle)))
      .all();
  }
}

function hasFilters(query: ListPptoDetalleFaseQueryDto): boolean {
  return query.IdPresupuesto !== undefined || query.IdpptoFase !== undefined;
}
