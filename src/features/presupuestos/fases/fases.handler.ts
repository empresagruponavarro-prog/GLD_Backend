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
    let resolvedIdPrincipal = query.id_centro_costos_principal;
    let resolvedIdEmpresa = query.id_empresa;

    const wantsRelationalFilter = Boolean(query.id_centro_costo || query.id_centro_costos_principal);

    // Un Centro de Costo (tienda/obra) hereda las fases de su centro de costo principal.
    if (!resolvedIdPrincipal && query.id_centro_costo) {
      const cc = await this.db.orm.public.CentroCostos.first({ id: query.id_centro_costo });
      if (cc?.id_centro_costos_principal) {
        resolvedIdPrincipal = cc.id_centro_costos_principal;
      }
    }

    if (resolvedIdPrincipal && !resolvedIdEmpresa) {
      const ccp = await this.db.orm.public.centro_costos_principal.first({ id: resolvedIdPrincipal });
      if (ccp?.id_empresa) {
        resolvedIdEmpresa = ccp.id_empresa;
      }
    }

    // Si el usuario solicitó filtrar por Centro de Costo pero no tiene cadena asociada, retornar vacío
    if (wantsRelationalFilter && !resolvedIdPrincipal) {
      return toPaginated([], 0, 1, query.pageSize ?? 20);
    }

    const effectiveQuery = {
      ...query,
      pageSize: query.pageSize ?? (resolvedIdPrincipal || wantsRelationalFilter ? 100 : 20),
    };
    const { page, pageSize, offset } = pageParams(effectiveQuery);

    const base = this.db.orm.public.ppto_Fases.orderBy((f) => f.FaseProyecto.asc());
    const filtering = hasFilters(query) || Boolean(resolvedIdPrincipal);

    const collection = filtering
      ? base.where((f) =>
          and(
            ...(query.IdpptoFase ? [f.IdpptoFase.ilike(`%${query.IdpptoFase}%`)] : []),
            ...(query.FaseProyecto ? [f.FaseProyecto.ilike(`%${query.FaseProyecto}%`)] : []),
            ...(resolvedIdEmpresa ? [f.id_empresa.eq(resolvedIdEmpresa)] : []),
            ...(resolvedIdPrincipal ? [f.id_centro_costos_principal.eq(resolvedIdPrincipal)] : []),
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
        id_empresa: dto.id_empresa,
        id_centro_costos_principal: dto.id_centro_costos_principal,
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
      id_empresa?: number;
      id_centro_costos_principal?: number;
      FaseProyecto?: Varchar255;
    } = {};
    if (dto.IdpptoFase !== undefined) data.IdpptoFase = toVarchar(dto.IdpptoFase);
    if (dto.id_empresa !== undefined) data.id_empresa = dto.id_empresa;
    if (dto.id_centro_costos_principal !== undefined) data.id_centro_costos_principal = dto.id_centro_costos_principal;
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
      .orderBy((fc) => fc.Descripcion.asc())
      .all();
  }
}

function hasFilters(query: ListPptoFaseQueryDto): boolean {
  return (
    query.IdpptoFase !== undefined ||
    query.FaseProyecto !== undefined ||
    query.id_empresa !== undefined ||
    query.id_centro_costo !== undefined ||
    query.id_centro_costos_principal !== undefined
  );
}
