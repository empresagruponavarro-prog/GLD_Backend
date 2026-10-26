import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { CreateNivelDto, NivelResponseDto, UpdateNivelDto } from './nivel.dto.js';

type Varchar20 = Varchar<20>;
type Varchar150 = Varchar<150>;

function toVarchar<T>(val: unknown): T {
  return val as unknown as T;
}

@Injectable()
export class NivelHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(soloActivos = false): Promise<NivelResponseDto[]> {
    const query = soloActivos
      ? this.db.orm.public.nivel.where({ estado: true })
      : this.db.orm.public.nivel;

    const rows = await query.orderBy((n) => n.id.asc()).all();
    return rows.map((r) => ({
      id: r.id,
      codigo: String(r.codigo),
      descripcion: String(r.descripcion),
      estado: r.estado,
    }));
  }

  async getById(id: number): Promise<NivelResponseDto> {
    const row = await this.db.orm.public.nivel.first({ id });
    if (!row) throw new NotFoundException(`Nivel con id ${id} no encontrado`);
    return {
      id: row.id,
      codigo: String(row.codigo),
      descripcion: String(row.descripcion),
      estado: row.estado,
    };
  }

  async create(dto: CreateNivelDto): Promise<NivelResponseDto> {
    try {
      const created = await this.db.orm.public.nivel.create({
        codigo: toVarchar<Varchar20>(dto.codigo),
        descripcion: toVarchar<Varchar150>(dto.descripcion),
        estado: dto.estado ?? true,
      });
      return {
        id: created.id,
        codigo: String(created.codigo),
        descripcion: String(created.descripcion),
        estado: created.estado,
      };
    } catch (error) {
      throwIfUniqueViolation(error, `El código de nivel "${dto.codigo}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateNivelDto): Promise<NivelResponseDto> {
    const actual = await this.db.orm.public.nivel.first({ id });
    if (!actual) throw new NotFoundException(`Nivel con id ${id} no encontrado`);

    const updateData: {
      descripcion?: Varchar150;
      estado?: boolean;
    } = {};

    if (dto.descripcion !== undefined) updateData.descripcion = toVarchar<Varchar150>(dto.descripcion);
    if (dto.estado !== undefined) updateData.estado = dto.estado;

    await this.db.orm.public.nivel.where({ id }).update(updateData);
    return this.getById(id);
  }

  async toggleEstado(id: number, estado: boolean): Promise<NivelResponseDto> {
    const actual = await this.db.orm.public.nivel.first({ id });
    if (!actual) throw new NotFoundException(`Nivel con id ${id} no encontrado`);

    await this.db.orm.public.nivel.where({ id }).update({ estado });
    return this.getById(id);
  }
}
