import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import type { CreateTipoProyectoDto, SetPlanosTipoProyectoDto, TipoProyectoDto, UpdateTipoProyectoDto } from './tipo-proyecto.dto.js';

/**
 * Tipos de proyecto (TAMBO, ARUMA…) y los planos que cada uno exige (GRP S-08). Al asignar un tipo a un centro de costo se
 * copia su lista a la obra; cambiar el catálogo después no altera las listas que ya se copiaron.
 */
@Injectable()
export class TipoProyectoHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(soloActivos = false): Promise<TipoProyectoDto[]> {
    const orm = this.db.orm.public;
    const [tipos, vinculos, planos] = await Promise.all([
      (soloActivos ? orm.tipo_proyecto.where({ activo: true }) : orm.tipo_proyecto).all(),
      orm.tipo_proyecto_plano.all(),
      orm.tipo_plano.all(),
    ]);
    const plano = new Map(planos.map((p) => [p.id, p]));
    return [...tipos]
      .sort((a, b) => a.orden - b.orden || a.id - b.id)
      .map((t) => ({
        id: t.id,
        nombre: t.nombre,
        activo: t.activo,
        orden: t.orden,
        planos: vinculos
          .filter((v) => v.id_tipo_proyecto === t.id && plano.has(v.id_tipo_plano))
          .map((v) => ({ id_tipo_plano: v.id_tipo_plano, codigo: plano.get(v.id_tipo_plano)!.codigo, nombre: plano.get(v.id_tipo_plano)!.nombre, obligatorio: v.obligatorio }))
          .sort((a, b) => (plano.get(a.id_tipo_plano)!.orden - plano.get(b.id_tipo_plano)!.orden) || a.id_tipo_plano - b.id_tipo_plano),
      }));
  }

  async get(id: number): Promise<TipoProyectoDto> {
    const tipo = (await this.list()).find((t) => t.id === id);
    if (!tipo) throw new NotFoundException(`Tipo de proyecto ${id} no encontrado`);
    return tipo;
  }

  async create(dto: CreateTipoProyectoDto): Promise<TipoProyectoDto> {
    try {
      const fila = await this.db.orm.public.tipo_proyecto.create({ nombre: toVarchar<80>(dto.nombre), ...(dto.orden !== undefined ? { orden: dto.orden } : {}) });
      return this.get(fila.id);
    } catch (e) {
      throwIfUniqueViolation(e, `El tipo de proyecto «${dto.nombre}» ya existe`);
      throw e;
    }
  }

  async update(id: number, dto: UpdateTipoProyectoDto): Promise<TipoProyectoDto> {
    await this.get(id);
    try {
      await this.db.orm.public.tipo_proyecto.where({ id }).update({
        ...(dto.nombre !== undefined ? { nombre: toVarchar<80>(dto.nombre) } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        ...(dto.orden !== undefined ? { orden: dto.orden } : {}),
      });
    } catch (e) {
      throwIfUniqueViolation(e, `El tipo de proyecto «${dto.nombre}» ya existe`);
      throw e;
    }
    return this.get(id);
  }

  async remove(id: number): Promise<{ deleted: boolean; id: number }> {
    await this.get(id);
    const enUso = await this.db.orm.public.CentroCostos.first({ id_tipo_proyecto: id });
    if (enUso) throw new ConflictException('Hay centros de costo de este tipo: desactívelo en lugar de eliminarlo');
    await this.db.orm.public.tipo_proyecto.where({ id }).delete(); // sus planos se borran en cascada
    return { deleted: true, id };
  }

  /** Reemplaza la lista de planos del tipo (una sola vez por tipo de plano). */
  async setPlanos(id: number, dto: SetPlanosTipoProyectoDto): Promise<TipoProyectoDto> {
    await this.get(id);
    const ids = dto.planos.map((p) => p.id_tipo_plano);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Un tipo de plano no puede repetirse en la lista');
    const existentes = ids.length > 0 ? await this.db.orm.public.tipo_plano.where((p) => p.id.in(ids)).all() : [];
    const faltan = ids.filter((i) => !existentes.some((e) => e.id === i));
    if (faltan.length > 0) throw new BadRequestException(`No existe(n) el/los tipo(s) de plano: ${faltan.join(', ')}`);

    await this.db.transaction(async (tx) => {
      const orm = tx.orm.public;
      await orm.tipo_proyecto_plano.where({ id_tipo_proyecto: id }).delete();
      for (const p of dto.planos) {
        await orm.tipo_proyecto_plano.create({ id_tipo_proyecto: id, id_tipo_plano: p.id_tipo_plano, obligatorio: p.obligatorio ?? true });
      }
    });
    return this.get(id);
  }
}
