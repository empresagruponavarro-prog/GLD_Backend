import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AlmacenSql, B, I, T, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { AreaResponseDto, CreateAreaDto, UpdateAreaDto } from './area.dto.js';

const SPEC = { id: I, codigo: T, nombre: T, estado: B } as const;

@Injectable()
export class AreaHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async list(soloActivas = false): Promise<AreaResponseDto[]> {
    const q = sqlTag(this.sql);
    return q.rows<AreaResponseDto>(SPEC)`
      SELECT id, codigo::text AS codigo, nombre, estado FROM area
       WHERE (${soloActivas}::boolean = false OR estado) ORDER BY nombre`;
  }

  async create(dto: CreateAreaDto): Promise<AreaResponseDto> {
    const q = sqlTag(this.sql);
    const [dup] = await q.rows<{ id: number }>({ id: I })`SELECT id FROM area WHERE codigo = ${dto.codigo}::text`;
    if (dup) throw new ConflictException(`Ya existe un area con codigo ${dto.codigo}`);
    const [row] = await q.rows<AreaResponseDto>(SPEC)`
      INSERT INTO area (codigo, nombre) VALUES (${dto.codigo}::text, ${dto.nombre}::text)
      RETURNING id, codigo::text AS codigo, nombre, estado`;
    return row;
  }

  async update(id: number, dto: UpdateAreaDto): Promise<AreaResponseDto> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<AreaResponseDto>(SPEC)`
      UPDATE area SET
        nombre = CASE WHEN ${dto.nombre !== undefined}::boolean THEN ${dto.nombre ?? ''}::text ELSE nombre END,
        estado = CASE WHEN ${dto.estado !== undefined}::boolean THEN ${dto.estado ?? true}::boolean ELSE estado END
       WHERE id = ${id}::int
      RETURNING id, codigo::text AS codigo, nombre, estado`;
    if (!row) throw new NotFoundException(`Area ${id} no encontrada`);
    return row;
  }
}
