import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateUbicacionDto,
  ResolverUbicacionQueryDto,
  UbicacionResponseDto,
  UpdateUbicacionDto,
} from './ubicacion.dto.js';

type Varchar50 = Varchar<50>;
type Varchar255 = Varchar<255>;

function toVarchar<T>(val: unknown): T {
  return val as unknown as T;
}

interface AsignacionLocal {
  tipo: 'EMPRESA' | 'CENTRO_COSTO' | undefined;
  nombre: string | null;
}

/** El local pertenece a una Empresa O a un Centro de Costo (XOR): devuelve a cuál. */
function asignacionLocal(
  loc: { id_empresa: number | null; id_centro_costo: number | null } | null | undefined,
  empresas: Map<number, string>,
  centros: Map<number, string>,
): AsignacionLocal {
  if (!loc) return { tipo: undefined, nombre: null };
  if (loc.id_empresa) return { tipo: 'EMPRESA', nombre: empresas.get(loc.id_empresa) ?? null };
  if (loc.id_centro_costo) return { tipo: 'CENTRO_COSTO', nombre: centros.get(loc.id_centro_costo) ?? null };
  return { tipo: undefined, nombre: null };
}

@Injectable()
export class UbicacionHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(soloActivos = false): Promise<UbicacionResponseDto[]> {
    const query = soloActivos
      ? this.db.orm.public.ubicacion.where({ estado: true })
      : this.db.orm.public.ubicacion;

    const [rows, locales, niveles, ambientes, areas, empresas, centros] = await Promise.all([
      query.orderBy((u) => u.id.asc()).all(),
      this.db.orm.public.local.all(),
      this.db.orm.public.nivel.all(),
      this.db.orm.public.ambiente.all(),
      this.db.orm.public.area.all(),
      this.db.orm.public.Empresas.all(),
      this.db.orm.public.CentroCostos.all(),
    ]);

    const localMap = new Map(locales.map((l) => [l.id, l]));
    const nivelMap = new Map(niveles.map((n) => [n.id, n]));
    const ambienteMap = new Map(ambientes.map((a) => [a.id, a]));
    const areaMap = new Map(areas.map((ar) => [ar.id, ar]));
    const empresaMap = new Map(empresas.map((e) => [e.id_empresa, String(e.razon_social)]));
    const centroMap = new Map(centros.map((c) => [c.id, String(c.centro_costo ?? '')]));

    return rows.map((r) => {
      const loc = localMap.get(r.id_local);
      const niv = nivelMap.get(r.id_nivel);
      const amb = ambienteMap.get(r.id_ambiente);
      const ar = r.id_area !== null ? areaMap.get(r.id_area) : null;
      const asig = asignacionLocal(loc, empresaMap, centroMap);

      return {
        id: r.id,
        codigo: String(r.codigo),
        id_local: r.id_local,
        local_codigo: loc ? String(loc.codigo) : undefined,
        local_nombre: loc ? String(loc.nombre) : undefined,
        local_tipo_asignacion: asig.tipo,
        local_asignado_a: asig.nombre,
        id_nivel: r.id_nivel,
        nivel_codigo: niv ? String(niv.codigo) : undefined,
        nivel_descripcion: niv ? String(niv.descripcion) : undefined,
        id_ambiente: r.id_ambiente,
        ambiente_codigo: amb ? String(amb.codigo) : undefined,
        ambiente_descripcion: amb ? String(amb.descripcion) : undefined,
        id_area: r.id_area,
        area_codigo: ar ? String(ar.codigo) : null,
        area_nombre: ar ? String(ar.nombre) : null,
        observaciones: r.observaciones ? String(r.observaciones) : null,
        estado: r.estado,
      };
    });
  }

  async getById(id: number): Promise<UbicacionResponseDto> {
    const row = await this.db.orm.public.ubicacion.first({ id });
    if (!row) throw new NotFoundException(`Ubicación con id ${id} no encontrada`);

    const [loc, niv, amb, ar] = await Promise.all([
      this.db.orm.public.local.first({ id: row.id_local }),
      this.db.orm.public.nivel.first({ id: row.id_nivel }),
      this.db.orm.public.ambiente.first({ id: row.id_ambiente }),
      row.id_area !== null ? this.db.orm.public.area.first({ id: row.id_area }) : Promise.resolve(null),
    ]);
    const [empresa, centro] = await Promise.all([
      loc?.id_empresa ? this.db.orm.public.Empresas.first({ id_empresa: loc.id_empresa }) : Promise.resolve(null),
      loc?.id_centro_costo
        ? this.db.orm.public.CentroCostos.first({ id: loc.id_centro_costo })
        : Promise.resolve(null),
    ]);
    const asig = asignacionLocal(
      loc,
      empresa ? new Map([[empresa.id_empresa, String(empresa.razon_social)]]) : new Map(),
      centro
        ? new Map([[centro.id, String(centro.centro_costo ?? '')]])
        : new Map(),
    );

    return {
      id: row.id,
      codigo: String(row.codigo),
      id_local: row.id_local,
      local_codigo: loc ? String(loc.codigo) : undefined,
      local_nombre: loc ? String(loc.nombre) : undefined,
      local_tipo_asignacion: asig.tipo,
      local_asignado_a: asig.nombre,
      id_nivel: row.id_nivel,
      nivel_codigo: niv ? String(niv.codigo) : undefined,
      nivel_descripcion: niv ? String(niv.descripcion) : undefined,
      id_ambiente: row.id_ambiente,
      ambiente_codigo: amb ? String(amb.codigo) : undefined,
      ambiente_descripcion: amb ? String(amb.descripcion) : undefined,
      id_area: row.id_area,
      area_codigo: ar ? String(ar.codigo) : null,
      area_nombre: ar ? String(ar.nombre) : null,
      observaciones: row.observaciones ? String(row.observaciones) : null,
      estado: row.estado,
    };
  }

  /** Solo consulta: devuelve la ubicación de la tupla o `null` si aún no existe (no escribe en BD). */
  async resolver(query: ResolverUbicacionQueryDto): Promise<UbicacionResponseDto | null> {
    const row = await this.db.orm.public.ubicacion.first({
      id_local: query.id_local,
      id_nivel: query.id_nivel,
      id_ambiente: query.id_ambiente,
    });
    return row ? this.getById(row.id) : null;
  }

  async create(dto: CreateUbicacionDto): Promise<UbicacionResponseDto> {
    const [local, nivel, ambiente] = await Promise.all([
      this.db.orm.public.local.first({ id: dto.id_local }),
      this.db.orm.public.nivel.first({ id: dto.id_nivel }),
      this.db.orm.public.ambiente.first({ id: dto.id_ambiente }),
    ]);

    if (!local) throw new BadRequestException(`Local con id ${dto.id_local} no existe`);
    if (!nivel) throw new BadRequestException(`Nivel con id ${dto.id_nivel} no existe`);
    if (!ambiente) throw new BadRequestException(`Ambiente con id ${dto.id_ambiente} no existe`);

    if (dto.id_area) {
      const area = await this.db.orm.public.area.first({ id: dto.id_area });
      if (!area) throw new BadRequestException(`Área con id ${dto.id_area} no existe`);
    }

    // Si no se proporcionó código, autogenerar con formato: LOCAL-NIVEL-AMBIENTE
    const codigoFinal =
      dto.codigo?.trim() ||
      `${String(local.codigo)}-${String(nivel.codigo)}-${String(ambiente.codigo)}`.toUpperCase();

    try {
      const created = await this.db.orm.public.ubicacion.create({
        codigo: toVarchar<Varchar50>(codigoFinal),
        id_local: dto.id_local,
        id_nivel: dto.id_nivel,
        id_ambiente: dto.id_ambiente,
        id_area: dto.id_area ?? null,
        observaciones: dto.observaciones ? toVarchar<Varchar255>(dto.observaciones) : null,
        estado: dto.estado ?? true,
      });

      return this.getById(created.id);
    } catch (error) {
      throwIfUniqueViolation(
        error,
        `La ubicación con la combinación (Local, Nivel, Ambiente) o el código "${codigoFinal}" ya existe`,
      );
      throw error;
    }
  }

  async update(id: number, dto: UpdateUbicacionDto): Promise<UbicacionResponseDto> {
    const actual = await this.db.orm.public.ubicacion.first({ id });
    if (!actual) throw new NotFoundException(`Ubicación con id ${id} no encontrada`);

    const updateData: {
      codigo?: Varchar50;
      id_local?: number;
      id_nivel?: number;
      id_ambiente?: number;
      id_area?: number | null;
      observaciones?: Varchar255 | null;
      estado?: boolean;
    } = {};

    if (dto.id_local !== undefined) {
      const local = await this.db.orm.public.local.first({ id: dto.id_local });
      if (!local) throw new BadRequestException(`Local con id ${dto.id_local} no existe`);
      updateData.id_local = dto.id_local;
    }

    if (dto.id_nivel !== undefined) {
      const nivel = await this.db.orm.public.nivel.first({ id: dto.id_nivel });
      if (!nivel) throw new BadRequestException(`Nivel con id ${dto.id_nivel} no existe`);
      updateData.id_nivel = dto.id_nivel;
    }

    if (dto.id_ambiente !== undefined) {
      const ambiente = await this.db.orm.public.ambiente.first({ id: dto.id_ambiente });
      if (!ambiente) throw new BadRequestException(`Ambiente con id ${dto.id_ambiente} no existe`);
      updateData.id_ambiente = dto.id_ambiente;
    }

    if (dto.id_area !== undefined) {
      if (dto.id_area !== null) {
        const area = await this.db.orm.public.area.first({ id: dto.id_area });
        if (!area) throw new BadRequestException(`Área con id ${dto.id_area} no existe`);
      }
      updateData.id_area = dto.id_area;
    }

    if (dto.codigo !== undefined) updateData.codigo = toVarchar<Varchar50>(dto.codigo.trim());
    if (dto.observaciones !== undefined) {
      updateData.observaciones = dto.observaciones ? toVarchar<Varchar255>(dto.observaciones) : null;
    }
    if (dto.estado !== undefined) updateData.estado = dto.estado;

    try {
      await this.db.orm.public.ubicacion.where({ id }).update(updateData);
      return this.getById(id);
    } catch (error) {
      throwIfUniqueViolation(error, 'Ya existe una ubicación con ese código o esa combinación (Local, Nivel, Ambiente)');
      throw error;
    }
  }

  async toggleEstado(id: number, estado: boolean): Promise<UbicacionResponseDto> {
    const actual = await this.db.orm.public.ubicacion.first({ id });
    if (!actual) throw new NotFoundException(`Ubicación con id ${id} no encontrada`);

    await this.db.orm.public.ubicacion.where({ id }).update({ estado });
    return this.getById(id);
  }
}
