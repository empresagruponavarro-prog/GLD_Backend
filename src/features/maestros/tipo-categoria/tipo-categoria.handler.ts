import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  throwIfForeignKeyViolation,
  throwIfUniqueViolation,
} from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateTipoCategoriaDto,
  type TipoCategoriaRow,
  UpdateTipoCategoriaDto,
} from './tipo-categoria.dto.js';

@Injectable()
export class TipoCategoriaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<TipoCategoriaRow[]> {
    return await this.db.orm.public.tipo_categoria.orderBy((t) => t.id.asc()).all();
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
      });
    } catch (error) {
      throwIfUniqueViolation(error, `El código "${dto.codigo}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateTipoCategoriaDto): Promise<TipoCategoriaRow> {
    const row = await this.db.orm.public.tipo_categoria
      .where({ id })
      .update({ codigo: dto.codigo!, nombre: dto.nombre! });
    if (!row) throw new NotFoundException(`Tipo de categoría ${id} no encontrado`);
    return row;
  }

  async remove(id: number): Promise<void> {
    try {
      const row = await this.db.orm.public.tipo_categoria.where({ id }).delete();
      if (!row) throw new NotFoundException(`Tipo de categoría ${id} no encontrado`);
    } catch (error) {
      throwIfForeignKeyViolation(error, 'No se puede eliminar: tiene categorías asociadas');
      throw error;
    }
  }
}