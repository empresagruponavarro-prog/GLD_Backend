import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar, type Varchar255 } from '../../presupuestos/presupuestos.helpers.js';
import {
  CreateEspecialidadDto,
  EspecialidadResponseDto,
  EspecialidadSelectQueryDto,
  EspecialidadSelectResponseDto,
  ListEspecialidadQueryDto,
  TipoAnexo,
  UpdateEspecialidadDto,
} from './especialidad.dto.js';

type EspecialidadRow = {
  id: number;
  TipoAnexo: Varchar255 | null;
  Anexo_Especialidad: Varchar255 | null;
};

type EspecialidadUpdateData = Partial<{
  TipoAnexo: Varchar255 | null;
  Anexo_Especialidad: Varchar255 | null;
}>;

@Injectable()
export class EspecialidadHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListEspecialidadQueryDto): Promise<Paginated<EspecialidadResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.Anexo_Especialidad.orderBy((t) => t.id.asc());
    const collection = hasFilters(query)
      ? base.where((t) =>
          and(
            ...(query.tipoAnexo ? [t.TipoAnexo.eq(toVarchar(query.tipoAnexo))] : []),
            ...(query.descripcion ? [t.Anexo_Especialidad.ilike(`%${query.descripcion}%`)] : []),
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data.map(toResponse), total.total, page, pageSize);
  }

  async select(query: EspecialidadSelectQueryDto): Promise<EspecialidadSelectResponseDto[]> {
    const base = this.db.orm.public.Anexo_Especialidad.orderBy((t) => t.Anexo_Especialidad.asc());
    const collection = query.tipoAnexo
      ? base.where((t) => t.TipoAnexo.eq(toVarchar(query.tipoAnexo!)))
      : base;
    const rows = await collection.all();
    return rows.map((row) => ({ id: row.id, nombre: row.Anexo_Especialidad }));
  }

  async getById(id: number): Promise<EspecialidadResponseDto> {
    const row = await this.db.orm.public.Anexo_Especialidad.first({ id });
    if (!row) throw new NotFoundException(`Especialidad ${id} no encontrada`);
    return toResponse(row);
  }

  async create(dto: CreateEspecialidadDto): Promise<EspecialidadResponseDto> {
    const row = await this.db.orm.public.Anexo_Especialidad.create({
      TipoAnexo: toVarchar(dto.tipoAnexo),
      Anexo_Especialidad: toVarchar(dto.descripcion),
    });
    return toResponse(row);
  }

  async update(id: number, dto: UpdateEspecialidadDto): Promise<EspecialidadResponseDto> {
    const data: EspecialidadUpdateData = {};
    if (dto.tipoAnexo !== undefined) data.TipoAnexo = toVarchar(dto.tipoAnexo);
    if (dto.descripcion !== undefined) data.Anexo_Especialidad = toVarchar(dto.descripcion);

    const row = await this.db.orm.public.Anexo_Especialidad.where({ id }).update(data);
    if (!row) throw new NotFoundException(`Especialidad ${id} no encontrada`);
    return toResponse(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.Anexo_Especialidad.where({ id }).delete();
    if (!row) throw new NotFoundException(`Especialidad ${id} no encontrada`);
  }
}

function toResponse(row: EspecialidadRow): EspecialidadResponseDto {
  return {
    id: row.id,
    tipoAnexo: row.TipoAnexo as TipoAnexo | null,
    descripcion: row.Anexo_Especialidad,
  };
}

function hasFilters(query: ListEspecialidadQueryDto): boolean {
  return query.tipoAnexo !== undefined || query.descripcion !== undefined;
}