import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateCategoriaDto,
  ListCategoriaQueryDto,
  type CategoriaRow,
  UpdateCategoriaDto,
} from './categoria.dto.js';

@Injectable()
export class CategoriaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListCategoriaQueryDto): Promise<Paginated<CategoriaRow>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.categoria.orderBy((c) => c.id.asc());
    const collection = hasFilters(query)
      ? base.where((c) =>
          and(
            ...(query.codigo ? [c.codigo.ilike(`%${query.codigo}%`)] : []),
            ...(query.descripcion ? [c.descripcion.ilike(`%${query.descripcion}%`)] : []),
            ...(query.estado !== undefined ? [c.estado.eq(query.estado)] : []),
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data, total.total, page, pageSize);
  }

  async getById(id: number): Promise<CategoriaRow> {
    const row = await this.db.orm.public.categoria.first({ id });
    if (!row) throw new NotFoundException(`Categoría ${id} no encontrada`);
    return row;
  }

  async create(dto: CreateCategoriaDto): Promise<CategoriaRow> {
    await this.assertTipoCategoriaExists(dto.id_tipo_categoria);
    try {
      return await this.db.orm.public.categoria.create({
        codigo: dto.codigo,
        id_tipo_categoria: dto.id_tipo_categoria,
        descripcion: dto.descripcion,
        estado: dto.estado ?? true,
      });
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateCategoriaDto): Promise<CategoriaRow> {
    if (dto.id_tipo_categoria !== undefined) {
      await this.assertTipoCategoriaExists(dto.id_tipo_categoria);
    }
    const data: Partial<CategoriaRow> = {};
    if (dto.codigo !== undefined) data.codigo = dto.codigo;
    if (dto.id_tipo_categoria !== undefined) data.id_tipo_categoria = dto.id_tipo_categoria;
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion;
    if (dto.estado !== undefined) data.estado = dto.estado;

    try {
      const row = await this.db.orm.public.categoria.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Categoría ${id} no encontrada`);
      return row;
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo ?? ''}" ya existe`);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.categoria.where({ id }).update({ estado: false });
    if (!row) throw new NotFoundException(`Categoría ${id} no encontrada`);
  }

  private async assertTipoCategoriaExists(id: number): Promise<void> {
    const tipo = await this.db.orm.public.tipo_categoria.first({ id });
    if (!tipo) throw new BadRequestException(`Tipo de categoría ${id} no existe`);
  }
}

function hasFilters(query: ListCategoriaQueryDto): boolean {
  return (
    query.codigo !== undefined || query.descripcion !== undefined || query.estado !== undefined
  );
}