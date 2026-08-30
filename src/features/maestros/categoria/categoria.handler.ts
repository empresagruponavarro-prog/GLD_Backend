import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { CreateCategoriaDto, type CategoriaRow, UpdateCategoriaDto } from './categoria.dto.js';

@Injectable()
export class CategoriaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<CategoriaRow[]> {
    return await this.db.orm.public.categoria.orderBy((c) => c.id.asc()).all();
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