import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import { pageParams, toPaginated, type Paginated } from '../../../../platform/db/pagination.js';
import { throwIfUniqueViolation } from '../../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import {
  CreateEquivalenciaDto,
  EquivalenciaResponseDto,
  ListEquivalenciaQueryDto,
  UpdateEquivalenciaDto,
} from './equivalencia.dto.js';

@Injectable()
export class EquivalenciaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(
    origenId: number,
    query: ListEquivalenciaQueryDto,
  ): Promise<Paginated<EquivalenciaResponseDto>> {
    await this.assertUnidadExists(origenId);
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.unidad_medida_equivalencia
      .where({ id_uni_med_origen: origenId })
      .orderBy((e) => e.id.asc());
    const collection = hasFilters(query)
      ? base.where((e) =>
          and(
            ...(query.id_uni_med_destino !== undefined
              ? [e.id_uni_med_destino.eq(query.id_uni_med_destino)]
              : []),
            ...(query.estado !== undefined ? [e.estado.eq(query.estado)] : []),
          ),
        )
      : base;
    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);
    return toPaginated(data, total.total, page, pageSize);
  }

  async getById(origenId: number, equivalenciaId: number): Promise<EquivalenciaResponseDto> {
    const row = await this.db.orm.public.unidad_medida_equivalencia.first({
      id: equivalenciaId,
      id_uni_med_origen: origenId,
    });
    if (!row) throw new NotFoundException(`Equivalencia ${equivalenciaId} no encontrada`);
    return row;
  }

  async create(origenId: number, dto: CreateEquivalenciaDto): Promise<EquivalenciaResponseDto> {
    await this.assertUnidadExists(origenId);
    await this.assertDestino(dto.id_uni_med_destino, origenId);
    try {
      return await this.db.orm.public.unidad_medida_equivalencia.create({
        id_uni_med_origen: origenId,
        id_uni_med_destino: dto.id_uni_med_destino,
        factor_conversion: dto.factor_conversion,
        estado: dto.estado,
      });
    } catch (error) {
      throwIfUniqueViolation(error, 'La equivalencia ya existe para esta unidad de medida');
      throw error;
    }
  }

  async update(
    origenId: number,
    equivalenciaId: number,
    dto: UpdateEquivalenciaDto,
  ): Promise<EquivalenciaResponseDto> {
    await this.getById(origenId, equivalenciaId);
    if (dto.id_uni_med_destino !== undefined) {
      await this.assertDestino(dto.id_uni_med_destino, origenId);
    }

    const data: Partial<EquivalenciaResponseDto> = {};
    if (dto.id_uni_med_destino !== undefined) data.id_uni_med_destino = dto.id_uni_med_destino;
    if (dto.factor_conversion !== undefined) data.factor_conversion = dto.factor_conversion;
    if (dto.estado !== undefined) data.estado = dto.estado;

    try {
      const row = await this.db.orm.public.unidad_medida_equivalencia
        .where({ id: equivalenciaId, id_uni_med_origen: origenId })
        .update(data);
      if (!row) throw new NotFoundException(`Equivalencia ${equivalenciaId} no encontrada`);
      return row;
    } catch (error) {
      throwIfUniqueViolation(error, 'La equivalencia ya existe para esta unidad de medida');
      throw error;
    }
  }

  async remove(origenId: number, equivalenciaId: number): Promise<void> {
    const row = await this.db.orm.public.unidad_medida_equivalencia
      .where({ id: equivalenciaId, id_uni_med_origen: origenId })
      .update({ estado: false });
    if (!row) throw new NotFoundException(`Equivalencia ${equivalenciaId} no encontrada`);
  }

  private async assertUnidadExists(id: number): Promise<void> {
    const unidad = await this.db.orm.public.unidad_medida.first({ id });
    if (!unidad) throw new NotFoundException(`Unidad de medida ${id} no encontrada`);
  }

  private async assertDestino(destinoId: number, origenId: number): Promise<void> {
    if (destinoId === origenId) {
      throw new BadRequestException('La unidad destino no puede ser la misma que la origen');
    }
    const destino = await this.db.orm.public.unidad_medida.first({ id: destinoId });
    if (!destino) throw new BadRequestException(`Unidad de medida ${destinoId} no existe`);
  }
}

function hasFilters(query: ListEquivalenciaQueryDto): boolean {
  return query.id_uni_med_destino !== undefined || query.estado !== undefined;
}