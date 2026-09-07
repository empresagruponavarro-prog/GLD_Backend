import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar, type Varchar255 } from '../presupuestos.helpers.js';
import {
  CreatePptoFaseDto,
  ListPptoFaseQueryDto,
  PptoFaseResponseDto,
  UpdatePptoFaseDto,
} from './fases.dto.js';

@Injectable()
export class PptoFasesHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListPptoFaseQueryDto): Promise<Paginated<PptoFaseResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.ppto_Fases.orderBy((f) => f.id.asc());
    const collection = hasFilters(query)
      ? base.where((f) =>
          and(
            ...(query.IdpptoFase ? [f.IdpptoFase.ilike(`%${query.IdpptoFase}%`)] : []),
            ...(query.FaseProyecto ? [f.FaseProyecto.ilike(`%${query.FaseProyecto}%`)] : []),
            ...(query.CodEmpresa ? [f.CodEmpresa.eq(toVarchar(query.CodEmpresa))] : []),
          ),
        )
      : base;

    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);

    return toPaginated(data as PptoFaseResponseDto[], total.total, page, pageSize);
  }

  async getById(idOrCode: string | number): Promise<PptoFaseResponseDto> {
    const numId = Number(idOrCode);
    const row = isNaN(numId)
      ? await this.db.orm.public.ppto_Fases.first({ IdpptoFase: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_Fases.first({ id: numId });

    if (!row) throw new NotFoundException(`Fase de presupuesto "${idOrCode}" no encontrada`);
    return row as PptoFaseResponseDto;
  }

  async create(dto: CreatePptoFaseDto): Promise<PptoFaseResponseDto> {
    try {
      const created = await this.db.orm.public.ppto_Fases.create({
        IdpptoFase: toVarchar(dto.IdpptoFase),
        CodEmpresa: toVarchar(dto.CodEmpresa),
        CodCentroCtoPrincipal: toVarchar(dto.CodCentroCtoPrincipal),
        FaseProyecto: toVarchar(dto.FaseProyecto),
      });
      return created as PptoFaseResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdpptoFase "${dto.IdpptoFase}" ya existe`);
      throw error;
    }
  }

  async update(idOrCode: string | number, dto: UpdatePptoFaseDto): Promise<PptoFaseResponseDto> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_Fases.first({ IdpptoFase: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_Fases.first({ id: numId });
    if (!current) throw new NotFoundException(`Fase "${idOrCode}" no encontrada`);
    const id = current.id;
    const data: {
      IdpptoFase?: Varchar255;
      CodEmpresa?: Varchar255;
      CodCentroCtoPrincipal?: Varchar255;
      FaseProyecto?: Varchar255;
    } = {};
    if (dto.IdpptoFase !== undefined) data.IdpptoFase = toVarchar(dto.IdpptoFase);
    if (dto.CodEmpresa !== undefined) data.CodEmpresa = toVarchar(dto.CodEmpresa);
    if (dto.CodCentroCtoPrincipal !== undefined) data.CodCentroCtoPrincipal = toVarchar(dto.CodCentroCtoPrincipal);
    if (dto.FaseProyecto !== undefined) data.FaseProyecto = toVarchar(dto.FaseProyecto);

    try {
      const row = await this.db.orm.public.ppto_Fases.where({ id }).update(data);
      if (!row) throw new NotFoundException(`Fase ${id} no encontrada`);
      return row as PptoFaseResponseDto;
    } catch (error) {
      throwIfUniqueViolation(error, `El IdpptoFase ya existe`);
      throw error;
    }
  }

  async remove(idOrCode: string | number): Promise<{ deleted: boolean; id: number; code: string | null }> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_Fases.first({ IdpptoFase: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_Fases.first({ id: numId });
    if (!current) throw new NotFoundException(`Fase "${idOrCode}" no encontrada`);
    await this.db.orm.public.ppto_Fases.where({ id: current.id }).delete();
    return { deleted: true, id: current.id, code: current.IdpptoFase };
  }

  async getCategoriasDeFase(idpptoFase: string) {
    return this.db.orm.public.ppto_FasesCategorias
      .where((fc) => fc.IdpptoFase.eq(toVarchar(idpptoFase)))
      .all();
  }
}

function hasFilters(query: ListPptoFaseQueryDto): boolean {
  return query.IdpptoFase !== undefined || query.FaseProyecto !== undefined || query.CodEmpresa !== undefined;
}
