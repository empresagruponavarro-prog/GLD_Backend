import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlmacenSql, B, I, IN, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { AreaResponseDto, CreateAreaDto, UpdateAreaDto } from './area.dto.js';

const SPEC = { id: I, codigo: T, nombre: T, estado: B, descripcion: TN, idJefe: IN, jefe: TN } as const;

@Injectable()
export class AreaHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async list(soloActivas = false): Promise<AreaResponseDto[]> {
    const q = sqlTag(this.sql);
    return q.rows<AreaResponseDto>(SPEC)`
      SELECT a.id, a.codigo::text AS codigo, a.nombre, a.estado, a.descripcion::text AS descripcion,
             a.id_jefe AS "idJefe", COALESCE(j."Anexo", j."NombreComercial")::text AS jefe
        FROM area a LEFT JOIN anexos j ON j.id = a.id_jefe
       WHERE (${soloActivas}::boolean = false OR a.estado) ORDER BY a.nombre`;
  }

  /** El código (AR-01, AR-02…) lo asigna el sistema a partir del ID correlativo. */
  async create(dto: CreateAreaDto): Promise<AreaResponseDto> {
    const q = sqlTag(this.sql);
    await this.validarJefe(dto.idJefe);
    const [nuevo] = await q.rows<{ id: number }>({ id: I })`
      WITH n AS (SELECT nextval(pg_get_serial_sequence('area', 'id'))::int AS id)
      INSERT INTO area (id, codigo, nombre, descripcion, id_jefe)
      SELECT n.id, 'AR-' || lpad(n.id::text, 2, '0'), ${dto.nombre.trim()}::text,
             NULLIF(${dto.descripcion?.trim() ?? ''}::text, ''), NULLIF(${dto.idJefe ?? 0}::int, 0)
        FROM n
      RETURNING id`;
    return this.porId(nuevo.id);
  }

  async update(id: number, dto: UpdateAreaDto): Promise<AreaResponseDto> {
    const q = sqlTag(this.sql);
    await this.validarJefe(dto.idJefe);
    const cambiaJefe = dto.idJefe !== undefined;
    const [row] = await q.rows<{ id: number }>({ id: I })`
      UPDATE area SET
        nombre = CASE WHEN ${dto.nombre !== undefined}::boolean THEN ${dto.nombre?.trim() ?? ''}::text ELSE nombre END,
        estado = CASE WHEN ${dto.estado !== undefined}::boolean THEN ${dto.estado ?? true}::boolean ELSE estado END,
        descripcion = CASE WHEN ${dto.descripcion !== undefined}::boolean THEN NULLIF(${dto.descripcion?.trim() ?? ''}::text, '') ELSE descripcion END,
        id_jefe = CASE WHEN ${cambiaJefe}::boolean THEN NULLIF(${dto.idJefe ?? 0}::int, 0) ELSE id_jefe END
       WHERE id = ${id}::int
      RETURNING id`;
    if (!row) throw new NotFoundException(`Area ${id} no encontrada`);
    return this.porId(id);
  }

  private async porId(id: number): Promise<AreaResponseDto> {
    const area = (await this.list()).find((a) => a.id === id);
    if (!area) throw new NotFoundException(`Area ${id} no encontrada`);
    return area;
  }

  /** El jefe o gerente debe ser un trabajador registrado. */
  private async validarJefe(idJefe: number | null | undefined): Promise<void> {
    if (!idJefe) return;
    const q = sqlTag(this.sql);
    const [fila] = await q.rows<{ id: number }>({ id: I })`
      SELECT id FROM anexos WHERE id = ${idJefe}::int AND "tipoAnexo"::text = 'Trabajador'`;
    if (!fila) throw new BadRequestException('El jefe o gerente debe ser un trabajador registrado');
  }
}
