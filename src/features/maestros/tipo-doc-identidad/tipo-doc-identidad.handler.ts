import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar, type Varchar255 } from '../../presupuestos/presupuestos.helpers.js';
import {
  CreateTipoDocIdentidadDto,
  ListTipoDocIdentidadQueryDto,
  TipoAnexo,
  TipoDocIdentidadResponseDto,
  UpdateTipoDocIdentidadDto,
} from './tipo-doc-identidad.dto.js';

type TipoDocIdentidadRow = {
  id: number;
  TipoAnexo: Varchar255 | null;
  Anexo_Documento_IDE: Varchar255 | null;
};

type TipoDocIdentidadUpdateData = Partial<{
  TipoAnexo: Varchar255 | null;
  Anexo_Documento_IDE: Varchar255 | null;
}>;

@Injectable()
export class TipoDocIdentidadHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(
    query: ListTipoDocIdentidadQueryDto,
  ): Promise<Paginated<TipoDocIdentidadResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.Anexo_TipoDocIDE.orderBy((t) => t.id.asc());
    const collection = hasFilters(query)
      ? base.where((t) =>
          and(
            ...(query.tipoAnexo ? [t.TipoAnexo.eq(toVarchar(query.tipoAnexo))] : []),
            ...(query.descripcion
              ? [t.Anexo_Documento_IDE.ilike(`%${query.descripcion}%`)]
              : []),
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data.map(toResponse), total.total, page, pageSize);
  }

  async getById(id: number): Promise<TipoDocIdentidadResponseDto> {
    const row = await this.db.orm.public.Anexo_TipoDocIDE.first({ id });
    if (!row) throw new NotFoundException(`Tipo de documento de identidad ${id} no encontrado`);
    return toResponse(row);
  }

  async create(dto: CreateTipoDocIdentidadDto): Promise<TipoDocIdentidadResponseDto> {
    const row = await this.db.orm.public.Anexo_TipoDocIDE.create({
      TipoAnexo: toVarchar(dto.tipoAnexo),
      Anexo_Documento_IDE: toVarchar(dto.descripcion),
    });
    return toResponse(row);
  }

  async update(
    id: number,
    dto: UpdateTipoDocIdentidadDto,
  ): Promise<TipoDocIdentidadResponseDto> {
    const data: TipoDocIdentidadUpdateData = {};
    if (dto.tipoAnexo !== undefined) data.TipoAnexo = toVarchar(dto.tipoAnexo);
    if (dto.descripcion !== undefined) data.Anexo_Documento_IDE = toVarchar(dto.descripcion);

    const row = await this.db.orm.public.Anexo_TipoDocIDE.where({ id }).update(data);
    if (!row) throw new NotFoundException(`Tipo de documento de identidad ${id} no encontrado`);
    return toResponse(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.Anexo_TipoDocIDE.where({ id }).delete();
    if (!row) throw new NotFoundException(`Tipo de documento de identidad ${id} no encontrado`);
  }
}

function toResponse(row: TipoDocIdentidadRow): TipoDocIdentidadResponseDto {
  return {
    id: row.id,
    tipoAnexo: row.TipoAnexo as TipoAnexo | null,
    descripcion: row.Anexo_Documento_IDE,
  };
}

function hasFilters(query: ListTipoDocIdentidadQueryDto): boolean {
  return query.tipoAnexo !== undefined || query.descripcion !== undefined;
}