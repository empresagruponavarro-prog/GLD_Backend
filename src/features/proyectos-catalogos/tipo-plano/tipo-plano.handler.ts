import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import type { CreateTipoPlanoDto, TipoPlanoDto, UpdateTipoPlanoDto } from './tipo-plano.dto.js';

type Fila = NonNullable<Awaited<ReturnType<Database['orm']['public']['tipo_plano']['first']>>>;

const mapTipo = (f: Fila): TipoPlanoDto => ({ id: f.id, codigo: f.codigo, nombre: f.nombre, disciplina: f.disciplina ?? null, activo: f.activo, orden: f.orden });

/** Tipos de plano (arquitectura, estructuras, eléctrico…): lo que luego exige cada tipo de proyecto (GRP S-08). */
@Injectable()
export class TipoPlanoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(soloActivos = false): Promise<TipoPlanoDto[]> {
    const orm = this.db.orm.public;
    const filas = await (soloActivos ? orm.tipo_plano.where({ activo: true }) : orm.tipo_plano).all();
    return [...filas].sort((a, b) => a.orden - b.orden || a.id - b.id).map(mapTipo);
  }

  async get(id: number): Promise<TipoPlanoDto> {
    const fila = await this.db.orm.public.tipo_plano.first({ id });
    if (!fila) throw new NotFoundException(`Tipo de plano ${id} no encontrado`);
    return mapTipo(fila);
  }

  async create(dto: CreateTipoPlanoDto): Promise<TipoPlanoDto> {
    try {
      const fila = await this.db.orm.public.tipo_plano.create({
        codigo: toVarchar<20>(dto.codigo),
        nombre: toVarchar<120>(dto.nombre),
        disciplina: toVarchar<50>(dto.disciplina ?? null),
        ...(dto.orden !== undefined ? { orden: dto.orden } : {}),
      });
      return mapTipo(fila);
    } catch (e) {
      throwIfUniqueViolation(e, `El código de plano «${dto.codigo}» ya existe`);
      throw e;
    }
  }

  async update(id: number, dto: UpdateTipoPlanoDto): Promise<TipoPlanoDto> {
    await this.get(id);
    await this.db.orm.public.tipo_plano.where({ id }).update({
      ...(dto.nombre !== undefined ? { nombre: toVarchar<120>(dto.nombre) } : {}),
      ...(dto.disciplina !== undefined ? { disciplina: toVarchar<50>(dto.disciplina) } : {}),
      ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
      ...(dto.orden !== undefined ? { orden: dto.orden } : {}),
    });
    return this.get(id);
  }

  async remove(id: number): Promise<{ deleted: boolean; id: number }> {
    await this.get(id);
    const orm = this.db.orm.public;
    if ((await orm.tipo_proyecto_plano.first({ id_tipo_plano: id })) || (await orm.obra_plano_requerido.first({ id_tipo_plano: id }))) {
      throw new ConflictException('Algún tipo de proyecto o alguna obra usa este plano: desactívelo en lugar de eliminarlo');
    }
    await orm.tipo_plano.where({ id }).delete();
    return { deleted: true, id };
  }
}
