import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import {
  throwIfUniqueViolation,
} from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateTipoCategoriaDto,
  ListTipoCategoriaQueryDto,
  type TipoCategoriaRow,
  UpdateTipoCategoriaDto,
} from './tipo-categoria.dto.js';

@Injectable()
export class TipoCategoriaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListTipoCategoriaQueryDto): Promise<Paginated<TipoCategoriaRow>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.tipo_categoria.orderBy((t) => t.id.asc());
    const collection = hasFilters(query)
      ? base.where((t) =>
          and(
            ...(query.codigo ? [t.codigo.ilike(`%${query.codigo}%`)] : []),
            ...(query.nombre ? [t.nombre.ilike(`%${query.nombre}%`)] : []),
            ...(query.estado !== undefined ? [t.estado.eq(query.estado)] : []),
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data, total.total, page, pageSize);
  }

  async getById(id: number): Promise<TipoCategoriaRow> {
    const row = await this.db.orm.public.tipo_categoria.first({ id });
    if (!row) throw new NotFoundException(`Tipo de categoría ${id} no encontrado`);
    return row;
  }

  async create(dto: CreateTipoCategoriaDto): Promise<TipoCategoriaRow> {
    try {
      return await this.db.orm.public.tipo_categoria.create({
        codigo: dto.codigo,
        nombre: dto.nombre,
        estado: dto.estado,
      });
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateTipoCategoriaDto): Promise<TipoCategoriaRow> {
    const data: Partial<TipoCategoriaRow> = {};
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.estado !== undefined) data.estado = dto.estado;

    try {
      const row = await this.db.orm.public.tipo_categoria.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Tipo de categoría ${id} no encontrado`);
      return row;
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo ?? ''}" ya existe`);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.tipo_categoria.where({ id }).update({ estado: false });
    if (!row) throw new NotFoundException(`Tipo de categoría ${id} no encontrado`);
  }
}

function hasFilters(query: ListTipoCategoriaQueryDto): boolean {
  return query.codigo !== undefined || query.nombre !== undefined || query.estado !== undefined;
}