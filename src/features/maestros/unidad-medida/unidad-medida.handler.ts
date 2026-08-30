import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  throwIfForeignKeyViolation,
  throwIfUniqueViolation,
} from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateUnidadMedidaDto,
  type UnidadMedidaRow,
  UpdateUnidadMedidaDto,
} from './unidad-medida.dto.js';

@Injectable()
export class UnidadMedidaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<UnidadMedidaRow[]> {
    return await this.db.orm.public.unidad_medida.orderBy((u) => u.id.asc()).all();
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
    try {
      const row = await this.db.orm.public.unidad_medida.where({ id }).delete();
      if (!row) throw new NotFoundException(`Unidad de medida ${id} no encontrada`);
    } catch (error) {
      throwIfForeignKeyViolation(error, 'No se puede eliminar: tiene dependencias asociadas');
      throw error;
    }
  }
}