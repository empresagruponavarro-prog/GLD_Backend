import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { pgErrorCode } from '../../../platform/db/pg-errors.js';
import { AlmacenSql, B, I, IN, T, sqlTag } from '../shared/almacen-sql.js';
import {
  AlmacenResponseDto,
  AlmacenSelectQueryDto,
  AlmacenSelectResponseDto,
  CreateAlmacenDto,
  ListAlmacenQueryDto,
  UpdateAlmacenDto,
} from './almacen.dto.js';

const SPEC = { id: I, codigo: T, nombre: T, id_empresa: IN, estado: B } as const;

@Injectable()
export class AlmacenHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async list(query: ListAlmacenQueryDto): Promise<Paginated<AlmacenResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const q = sqlTag(this.sql);
    const nombre = query.nombre ? `%${query.nombre}%` : '';
    const estado = query.estado === undefined ? '' : String(query.estado);
    const [count] = await q.rows<{ total: number }>({ total: I })`
      SELECT count(*)::int AS total FROM almacen
       WHERE (${nombre}::text = '' OR nombre ILIKE ${nombre}::text) AND (${estado}::text = '' OR estado::text = ${estado}::text)`;
    const rows = await q.rows<AlmacenResponseDto>(SPEC)`
      SELECT id, codigo::text AS codigo, nombre, id_empresa, estado FROM almacen
       WHERE (${nombre}::text = '' OR nombre ILIKE ${nombre}::text) AND (${estado}::text = '' OR estado::text = ${estado}::text)
       ORDER BY id LIMIT ${pageSize}::int OFFSET ${offset}::int`;
    return toPaginated(rows, count.total, page, pageSize);
  }

  async select(query: AlmacenSelectQueryDto): Promise<AlmacenSelectResponseDto[]> {
    const q = sqlTag(this.sql);
    const todos = query.soloActivos === 'false';
    return q.rows<AlmacenSelectResponseDto>({ id: I, nombre: T })`
      SELECT id, nombre FROM almacen WHERE (${todos}::boolean OR estado = true) ORDER BY nombre`;
  }

  async getById(id: number): Promise<AlmacenResponseDto> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<AlmacenResponseDto>(SPEC)`
      SELECT id, codigo::text AS codigo, nombre, id_empresa, estado FROM almacen WHERE id = ${id}::int`;
    if (!row) throw new NotFoundException(`Almacén ${id} no encontrado`);
    return row;
  }

  async create(dto: CreateAlmacenDto): Promise<AlmacenResponseDto> {
    const q = sqlTag(this.sql);
    try {
      const [row] = await q.rows<AlmacenResponseDto>(SPEC)`
        INSERT INTO almacen (codigo, nombre, id_empresa, estado)
        VALUES (${dto.codigo}, ${dto.nombre}, NULLIF(${dto.id_empresa ?? 0}::int, 0), ${dto.estado ?? true}::boolean)
        RETURNING id, codigo::text AS codigo, nombre, id_empresa, estado`;
      return row;
    } catch (error) {
      this.translate(error, dto.codigo);
      throw error;
    }
  }

  async update(id: number, dto: UpdateAlmacenDto): Promise<AlmacenResponseDto> {
    const actual = await this.getById(id);
    const q = sqlTag(this.sql);
    const estado = dto.estado ?? actual.estado;
    if (!estado && actual.estado) await this.assertSinStock(id);
    try {
      const [row] = await q.rows<AlmacenResponseDto>(SPEC)`
        UPDATE almacen SET codigo = ${dto.codigo ?? actual.codigo}, nombre = ${dto.nombre ?? actual.nombre},
               id_empresa = NULLIF(${dto.id_empresa ?? actual.id_empresa ?? 0}::int, 0), estado = ${estado}::boolean
         WHERE id = ${id}::int
        RETURNING id, codigo::text AS codigo, nombre, id_empresa, estado`;
      return row;
    } catch (error) {
      this.translate(error, dto.codigo ?? actual.codigo);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const actual = await this.getById(id);
    if (actual.estado) await this.assertSinStock(id);
    const q = sqlTag(this.sql);
    await q.rows({ id: I })`UPDATE almacen SET estado = false WHERE id = ${id}::int RETURNING id`;
  }

  private async assertSinStock(id: number): Promise<void> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<{ n: number }>({ n: I })`
      SELECT count(*)::int AS n FROM stock_almacen WHERE id_almacen = ${id}::int AND (cantidad > 0 OR cantidad_prestada > 0)`;
    if (row.n > 0) throw new BadRequestException('No se puede desactivar un almacén con stock');
  }

  private translate(error: unknown, codigo: string): void {
    if (pgErrorCode(error) === '23505') throw new ConflictException(`El código "${codigo}" ya existe`);
    if (pgErrorCode(error) === '23503') throw new BadRequestException('La empresa indicada no existe');
  }
}
