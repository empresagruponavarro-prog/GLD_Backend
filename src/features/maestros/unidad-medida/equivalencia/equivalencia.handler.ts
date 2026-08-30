import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import {
  CreateEquivalenciaDto,
  type EquivalenciaRow,
  UpdateEquivalenciaDto,
} from './equivalencia.dto.js';

@Injectable()
export class EquivalenciaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(origenId: number): Promise<EquivalenciaRow[]> {
    await this.assertUnidadExists(origenId);
    return await this.db.orm.public.unidad_medida_equivalencia
      .where({ id_uni_med_origen: origenId })
      .orderBy((e) => e.id.asc())
      .all();
  }

  async getById(origenId: number, equivalenciaId: number): Promise<EquivalenciaRow> {
    const row = await this.db.orm.public.unidad_medida_equivalencia.first({
      id: equivalenciaId,
      id_uni_med_origen: origenId,
    });
    if (!row) throw new NotFoundException(`Equivalencia ${equivalenciaId} no encontrada`);
    return row;
  }

  async create(origenId: number, dto: CreateEquivalenciaDto): Promise<EquivalenciaRow> {
    await this.assertUnidadExists(origenId);
    await this.assertDestino(dto.id_uni_med_destino, origenId);
    try {
      return await this.db.orm.public.unidad_medida_equivalencia.create({
        id_uni_med_origen: origenId,
        id_uni_med_destino: dto.id_uni_med_destino,
        factor_conversion: dto.factor_conversion,
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
  ): Promise<EquivalenciaRow> {
    await this.getById(origenId, equivalenciaId);
    if (dto.id_uni_med_destino !== undefined) {
      await this.assertDestino(dto.id_uni_med_destino, origenId);
    }

    const data: Partial<EquivalenciaRow> = {};
    if (dto.id_uni_med_destino !== undefined) data.id_uni_med_destino = dto.id_uni_med_destino;
    if (dto.factor_conversion !== undefined) data.factor_conversion = dto.factor_conversion;

    try {
      const row = await this.db.orm.public.unidad_medida_equivalencia
        .where({ id: equivalenciaId })
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
      .delete();
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