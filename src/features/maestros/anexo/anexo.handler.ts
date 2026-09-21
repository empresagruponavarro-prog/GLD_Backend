import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar, type Varchar255 } from '../../presupuestos/presupuestos.helpers.js';
import {
  AnexoResponseDto,
  AnexoSelectQueryDto,
  AnexoSelectResponseDto,
  CreateAnexoDto,
  ListAnexoQueryDto,
  TipoAnexo,
  UpdateAnexoDto,
} from './anexo.dto.js';

type AnexoRow = {
  id: number;
  tipoAnexo: 'Proveedor' | 'Cliente' | 'Trabajador' | null;
  AnexoEspecialidadId: number | null;
  AnexoTipoDocIdeId: number | null;
  NumeroDocIde: Varchar255 | null;
  Anexo: Varchar255 | null;
  NombreComercial: Varchar255 | null;
  Direccion: Varchar255 | null;
  Contacto: Varchar255 | null;
  Telefono: Varchar255 | null;
  Correo: Varchar255 | null;
  estado: boolean;
};

type AnexoUpdateData = Partial<{
  tipoAnexo: 'Proveedor' | 'Cliente' | 'Trabajador' | null;
  AnexoEspecialidadId: number | null;
  AnexoTipoDocIdeId: number | null;
  NumeroDocIde: Varchar255 | null;
  Anexo: Varchar255 | null;
  NombreComercial: Varchar255 | null;
  Direccion: Varchar255 | null;
  Contacto: Varchar255 | null;
  Telefono: Varchar255 | null;
  Correo: Varchar255 | null;
  estado: boolean;
}>;

@Injectable()
export class AnexoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListAnexoQueryDto): Promise<Paginated<AnexoResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.Anexos.orderBy((t) => t.id.asc());
    const collection = hasFilters(query)
      ? base.where((t) =>
          and(
            ...(query.tipoAnexo ? [t.tipoAnexo.eq(query.tipoAnexo)] : []),
            ...(query.AnexoEspecialidadId !== undefined
              ? [t.AnexoEspecialidadId.eq(query.AnexoEspecialidadId)]
              : []),
            ...(query.AnexoTipoDocIdeId !== undefined
              ? [t.AnexoTipoDocIdeId.eq(query.AnexoTipoDocIdeId)]
              : []),
            ...(query.Anexo ? [t.Anexo.ilike(`%${query.Anexo}%`)] : []),
            ...(query.NombreComercial
              ? [t.NombreComercial.ilike(`%${query.NombreComercial}%`)]
              : []),
            ...(query.estado !== undefined ? [t.estado.eq(query.estado)] : []),
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data.map(toResponse), total.total, page, pageSize);
  }

  async select(query: AnexoSelectQueryDto): Promise<AnexoSelectResponseDto[]> {
    const base = this.db.orm.public.Anexos.orderBy((a) => a.Anexo.asc());
    const collection = query.tipoAnexo
      ? base.where((a) => a.tipoAnexo.eq(query.tipoAnexo!))
      : base;
    const rows = await collection.all();
    return rows.map((row) => ({ id: row.id, nombre: row.Anexo ?? row.NombreComercial ?? null }));
  }

  async getById(id: number): Promise<AnexoResponseDto> {
    const row = await this.db.orm.public.Anexos.first({ id });
    if (!row) throw new NotFoundException(`Anexo ${id} no encontrado`);
    return toResponse(row);
  }

  async create(dto: CreateAnexoDto): Promise<AnexoResponseDto> {
    const row = await this.db.orm.public.Anexos.create({
      tipoAnexo: dto.tipoAnexo,
      AnexoEspecialidadId: dto.AnexoEspecialidadId,
      AnexoTipoDocIdeId: dto.AnexoTipoDocIdeId,
      NumeroDocIde: toVarchar(dto.NumeroDocIde),
      Anexo: toVarchar(dto.Anexo),
      NombreComercial: toVarchar(dto.NombreComercial),
      Direccion: toVarchar(dto.Direccion),
      Contacto: toVarchar(dto.Contacto),
      Telefono: toVarchar(dto.Telefono),
      Correo: toVarchar(dto.Correo),
      estado: dto.estado,
    });
    return toResponse(row);
  }

  async update(id: number, dto: UpdateAnexoDto): Promise<AnexoResponseDto> {
    const data: AnexoUpdateData = {};
    if (dto.tipoAnexo !== undefined) data.tipoAnexo = dto.tipoAnexo;
    if (dto.AnexoEspecialidadId !== undefined) data.AnexoEspecialidadId = dto.AnexoEspecialidadId;
    if (dto.AnexoTipoDocIdeId !== undefined) data.AnexoTipoDocIdeId = dto.AnexoTipoDocIdeId;
    if (dto.NumeroDocIde !== undefined) data.NumeroDocIde = toVarchar(dto.NumeroDocIde);
    if (dto.Anexo !== undefined) data.Anexo = toVarchar(dto.Anexo);
    if (dto.NombreComercial !== undefined) data.NombreComercial = toVarchar(dto.NombreComercial);
    if (dto.Direccion !== undefined) data.Direccion = toVarchar(dto.Direccion);
    if (dto.Contacto !== undefined) data.Contacto = toVarchar(dto.Contacto);
    if (dto.Telefono !== undefined) data.Telefono = toVarchar(dto.Telefono);
    if (dto.Correo !== undefined) data.Correo = toVarchar(dto.Correo);
    if (dto.estado !== undefined) data.estado = dto.estado;

    const row = await this.db.orm.public.Anexos.where({ id }).update(data);
    if (!row) throw new NotFoundException(`Anexo ${id} no encontrado`);
    return toResponse(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.Anexos.where({ id }).delete();
    if (!row) throw new NotFoundException(`Anexo ${id} no encontrado`);
  }
}

function toResponse(row: AnexoRow): AnexoResponseDto {
  return {
    id: row.id,
    tipoAnexo: row.tipoAnexo as TipoAnexo | null,
    AnexoEspecialidadId: row.AnexoEspecialidadId,
    AnexoTipoDocIdeId: row.AnexoTipoDocIdeId,
    NumeroDocIde: row.NumeroDocIde,
    Anexo: row.Anexo,
    NombreComercial: row.NombreComercial,
    Direccion: row.Direccion,
    Contacto: row.Contacto,
    Telefono: row.Telefono,
    Correo: row.Correo,
    estado: row.estado,
  };
}

function hasFilters(query: ListAnexoQueryDto): boolean {
  return (
    query.tipoAnexo !== undefined ||
    query.AnexoEspecialidadId !== undefined ||
    query.AnexoTipoDocIdeId !== undefined ||
    query.Anexo !== undefined ||
    query.NombreComercial !== undefined ||
    query.estado !== undefined
  );
}
