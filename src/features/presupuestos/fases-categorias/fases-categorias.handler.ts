import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar, type Varchar255 } from '../presupuestos.helpers.js';
import {
  CreatePptoFaseCategoriaDto,
  ListPptoFaseCategoriaQueryDto,
  PptoFaseCategoriaResponseDto,
  UpdatePptoFaseCategoriaDto,
} from './fases-categorias.dto.js';

@Injectable()
export class PptoFasesCategoriasHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListPptoFaseCategoriaQueryDto): Promise<Paginated<PptoFaseCategoriaResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.ppto_FasesCategorias.orderBy((fc) => fc.id.asc());
    const collection = hasFilters(query)
      ? base.where((fc) =>
          and(
            ...(query.IdpptoFaseCategoria ? [fc.IdpptoFaseCategoria.ilike(`%${query.IdpptoFaseCategoria}%`)] : []),
            ...(query.IdpptoFase ? [fc.IdpptoFase.eq(toVarchar(query.IdpptoFase))] : []),
            ...(query.Descripcion ? [fc.Descripcion.ilike(`%${query.Descripcion}%`)] : []),
          ),
        )
      : base;

    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);

    return toPaginated(data as PptoFaseCategoriaResponseDto[], total.total, page, pageSize);
  }

  async getById(idOrCode: string | number): Promise<PptoFaseCategoriaResponseDto> {
    const numId = Number(idOrCode);
    const row = isNaN(numId)
      ? await this.db.orm.public.ppto_FasesCategorias.first({ IdpptoFaseCategoria: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_FasesCategorias.first({ id: numId });

    if (!row) throw new NotFoundException(`Categoría de fase "${idOrCode}" no encontrada`);
    return row as PptoFaseCategoriaResponseDto;
  }

  async create(dto: CreatePptoFaseCategoriaDto): Promise<PptoFaseCategoriaResponseDto> {
    try {
      const created = await this.db.orm.public.ppto_FasesCategorias.create({
        IdpptoFaseCategoria: toVarchar(dto.IdpptoFaseCategoria),
        IdpptoFase: toVarchar(dto.IdpptoFase),
        Descripcion: toVarchar(dto.Descripcion),
      });
      return created as PptoFaseCategoriaResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdpptoFaseCategoria "${dto.IdpptoFaseCategoria}" ya existe`);
      throw error;
    }
  }

  async update(idOrCode: string | number, dto: UpdatePptoFaseCategoriaDto): Promise<PptoFaseCategoriaResponseDto> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_FasesCategorias.first({ IdpptoFaseCategoria: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_FasesCategorias.first({ id: numId });
    if (!current) throw new NotFoundException(`Categoría "${idOrCode}" no encontrada`);
    const id = current.id;
    const data: {
      IdpptoFaseCategoria?: Varchar255;
      IdpptoFase?: Varchar255;
      Descripcion?: Varchar255;
    } = {};
    if (dto.IdpptoFaseCategoria !== undefined) data.IdpptoFaseCategoria = toVarchar(dto.IdpptoFaseCategoria);
    if (dto.IdpptoFase !== undefined) data.IdpptoFase = toVarchar(dto.IdpptoFase);
    if (dto.Descripcion !== undefined) data.Descripcion = toVarchar(dto.Descripcion);

    try {
      const row = await this.db.orm.public.ppto_FasesCategorias.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Categoría ${id} no encontrada`);
      return row as PptoFaseCategoriaResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdpptoFaseCategoria ya existe`);
      throw error;
    }
  }

  async remove(idOrCode: string | number): Promise<{ deleted: boolean; id: number; code: string | null }> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_FasesCategorias.first({ IdpptoFaseCategoria: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_FasesCategorias.first({ id: numId });
    if (!current) throw new NotFoundException(`Categoría "${idOrCode}" no encontrada`);
    await this.db.orm.public.ppto_FasesCategorias.where({ id: current.id }).delete();
    return { deleted: true, id: current.id, code: current.IdpptoFaseCategoria };
  }
}

function hasFilters(query: ListPptoFaseCategoriaQueryDto): boolean {
  return query.IdpptoFaseCategoria !== undefined || query.IdpptoFase !== undefined || query.Descripcion !== undefined;
}
