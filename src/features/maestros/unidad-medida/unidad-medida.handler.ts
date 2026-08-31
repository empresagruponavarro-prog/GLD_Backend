import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateUnidadMedidaDto,
  ListUnidadMedidaQueryDto,
  type UnidadMedidaRow,
  UpdateUnidadMedidaDto,
} from './unidad-medida.dto.js';

@Injectable()
export class UnidadMedidaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListUnidadMedidaQueryDto): Promise<Paginated<UnidadMedidaRow>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.unidad_medida.orderBy((u) => u.id.asc());
    const collection = hasFilters(query)
      ? base.where((u) =>
          and(
            ...(query.codigo ? [u.codigo.ilike(`%${query.codigo}%`)] : []),
            ...(query.descripcion ? [u.descripcion.ilike(`%${query.descripcion}%`)] : []),
            ...(query.estado !== undefined ? [u.estado.eq(query.estado)] : []),
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data, total.total, page, pageSize);
  }

  async getById(id: number): Promise<UnidadMedidaRow> {
    const row = await this.db.orm.public.unidad_medida.first({ id });
    if (!row) throw new NotFoundException(`Unidad de medida ${id} no encontrada`);
    return row;
  }

  async create(dto: CreateUnidadMedidaDto): Promise<UnidadMedidaRow> {
    try {
      return await this.db.orm.public.unidad_medida.create({
        codigo: dto.codigo,
        descripcion: dto.descripcion,
        simbolo: dto.simbolo,
        estado: dto.estado,
      });
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateUnidadMedidaDto): Promise<UnidadMedidaRow> {
    const data: Partial<UnidadMedidaRow> = {};
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.simbolo !== undefined) data.simbolo = dto.simbolo;
    if (dto.estado !== undefined) data.estado = dto.estado;

    try {
      const row = await this.db.orm.public.unidad_medida.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Unidad de medida ${id} no encontrada`);
      return row;
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo ?? ''}" ya existe`);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.unidad_medida.where({ id }).update({ estado: false });
    if (!row) throw new NotFoundException(`Unidad de medida ${id} no encontrada`);
  }
}

function hasFilters(query: ListUnidadMedidaQueryDto): boolean {
  return (
    query.codigo !== undefined || query.descripcion !== undefined || query.estado !== undefined
  );
}