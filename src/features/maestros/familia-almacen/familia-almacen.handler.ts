import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { pgErrorCode } from '../../../platform/db/pg-errors.js';
import { AlmacenSql, B, I, T, sqlTag } from '../../almacen/shared/almacen-sql.js';
import {
  CreateFamiliaAlmacenDto,
  FamiliaAlmacenResponseDto,
  FamiliaAlmacenSelectResponseDto,
  UpdateFamiliaAlmacenDto,
} from './familia-almacen.dto.js';

const SPEC = { id: I, prefijo: T, nombre: T, ultimo_correlativo: I, estado: B } as const;

@Injectable()
export class FamiliaAlmacenHandler {
  constructor(private readonly sql: AlmacenSql) {}

  list(): Promise<FamiliaAlmacenResponseDto[]> {
    const q = sqlTag(this.sql);
    return q.rows<FamiliaAlmacenResponseDto>(SPEC)`
      SELECT id, prefijo::text AS prefijo, nombre, ultimo_correlativo, estado FROM familia_almacen ORDER BY prefijo`;
  }

  select(): Promise<FamiliaAlmacenSelectResponseDto[]> {
    const q = sqlTag(this.sql);
    return q.rows<FamiliaAlmacenSelectResponseDto>({ id: I, nombre: T, prefijo: T })`
      SELECT id, (prefijo::text || ' - ' || nombre) AS nombre, prefijo::text AS prefijo
        FROM familia_almacen WHERE estado = true ORDER BY prefijo`;
  }

  async create(dto: CreateFamiliaAlmacenDto): Promise<FamiliaAlmacenResponseDto> {
    const q = sqlTag(this.sql);
    try {
      const [row] = await q.rows<FamiliaAlmacenResponseDto>(SPEC)`
        INSERT INTO familia_almacen (prefijo, nombre) VALUES (${dto.prefijo}, ${dto.nombre})
        RETURNING id, prefijo::text AS prefijo, nombre, ultimo_correlativo, estado`;
      return row;
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw new ConflictException(`El prefijo "${dto.prefijo}" ya existe`);
      throw error;
    }
  }

  async update(id: number, dto: UpdateFamiliaAlmacenDto): Promise<FamiliaAlmacenResponseDto> {
    const q = sqlTag(this.sql);
    const [actual] = await q.rows<FamiliaAlmacenResponseDto>(SPEC)`
      SELECT id, prefijo::text AS prefijo, nombre, ultimo_correlativo, estado FROM familia_almacen WHERE id = ${id}::int`;
    if (!actual) throw new NotFoundException(`Familia ${id} no encontrada`);
    const [row] = await q.rows<FamiliaAlmacenResponseDto>(SPEC)`
      UPDATE familia_almacen SET nombre = ${dto.nombre ?? actual.nombre}, estado = ${dto.estado ?? actual.estado}::boolean
       WHERE id = ${id}::int
      RETURNING id, prefijo::text AS prefijo, nombre, ultimo_correlativo, estado`;
    return row;
  }
}
