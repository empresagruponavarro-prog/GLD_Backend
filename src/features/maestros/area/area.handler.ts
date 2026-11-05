import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AlmacenSql, B, I, IN, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { AreaResponseDto, CreateAreaDto, UpdateAreaDto } from './area.dto.js';

const SPEC = { id: I, codigo: T, nombre: T, estado: B, idJefe: IN, jefe: TN, idAreaPadre: IN, areaPadre: TN, jefeSuperior: TN } as const;

@Injectable()
export class AreaHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async list(soloActivas = false): Promise<AreaResponseDto[]> {
    const q = sqlTag(this.sql);
    return q.rows<AreaResponseDto>(SPEC)`
      SELECT a.id, a.codigo::text AS codigo, a.nombre, a.estado,
             a.id_jefe AS "idJefe", COALESCE(j."Anexo", j."NombreComercial")::text AS jefe,
             a.id_area_padre AS "idAreaPadre", p.nombre::text AS "areaPadre",
             COALESCE(jp."Anexo", jp."NombreComercial")::text AS "jefeSuperior"
        FROM area a
        LEFT JOIN anexos j ON j.id = a.id_jefe
        LEFT JOIN area p ON p.id = a.id_area_padre
        LEFT JOIN anexos jp ON jp.id = p.id_jefe
       WHERE (${soloActivas}::boolean = false OR a.estado) ORDER BY a.nombre`;
  }

  /** El código (AR-01, AR-02…) lo asigna el sistema a partir del ID correlativo. */
  async create(dto: CreateAreaDto): Promise<AreaResponseDto> {
    const q = sqlTag(this.sql);
    await this.validarJefe(dto.idJefe);
    await this.validarPadre(null, dto.idAreaPadre);
    const [nuevo] = await q.rows<{ id: number }>({ id: I })`
      WITH n AS (SELECT nextval(pg_get_serial_sequence('area', 'id'))::int AS id)
      INSERT INTO area (id, codigo, nombre, id_jefe, id_area_padre, estado)
      SELECT n.id, 'AR-' || lpad(n.id::text, GREATEST(2, length(n.id::text)), '0'), ${dto.nombre.trim()}::text,
             NULLIF(${dto.idJefe ?? 0}::int, 0),
             NULLIF(${dto.idAreaPadre ?? 0}::int, 0), ${dto.estado ?? true}::boolean
        FROM n
      RETURNING id`;
    return this.porId(nuevo.id);
  }

  async update(id: number, dto: UpdateAreaDto): Promise<AreaResponseDto> {
    const q = sqlTag(this.sql);
    await this.validarJefe(dto.idJefe);
    await this.validarPadre(id, dto.idAreaPadre);
    const cambiaJefe = dto.idJefe !== undefined;
    const cambiaPadre = dto.idAreaPadre !== undefined;
    const [row] = await q.rows<{ id: number }>({ id: I })`
      UPDATE area SET
        nombre = CASE WHEN ${dto.nombre !== undefined}::boolean THEN ${dto.nombre?.trim() ?? ''}::text ELSE nombre END,
        estado = CASE WHEN ${dto.estado !== undefined}::boolean THEN ${dto.estado ?? true}::boolean ELSE estado END,
        id_jefe = CASE WHEN ${cambiaJefe}::boolean THEN NULLIF(${dto.idJefe ?? 0}::int, 0) ELSE id_jefe END,
        id_area_padre = CASE WHEN ${cambiaPadre}::boolean THEN NULLIF(${dto.idAreaPadre ?? 0}::int, 0) ELSE id_area_padre END
       WHERE id = ${id}::int
      RETURNING id`;
    if (!row) throw new NotFoundException(`Area ${id} no encontrada`);
    return this.porId(id);
  }

  /** Elimina el área solo si nadie la usa; si está en uso se sugiere desactivarla. */
  async remove(id: number): Promise<void> {
    const q = sqlTag(this.sql);
    const [existe] = await q.rows<{ id: number }>({ id: I })`SELECT id FROM area WHERE id = ${id}::int`;
    if (!existe) throw new NotFoundException(`Area ${id} no encontrada`);
    const [uso] = await q.rows<{ usuarios: string; requerimientos: string; documentos: string; equipos: string; ubicaciones: string; dependientes: string }>({
      dependientes: T,
      usuarios: T,
      requerimientos: T,
      documentos: T,
      equipos: T,
      ubicaciones: T,
    })`
      SELECT (SELECT count(*) FROM area WHERE id_area_padre = ${id}::int)::text AS dependientes,
             (SELECT count(*) FROM usuarios WHERE id_area = ${id}::int)::text AS usuarios,
             (SELECT count(*) FROM requerimiento WHERE id_area = ${id}::int)::text AS requerimientos,
             (SELECT count(*) FROM "documentosOrigen" WHERE id_area = ${id}::int)::text AS documentos,
             (SELECT count(*) FROM activo_fijo WHERE id_area = ${id}::int)::text AS equipos,
             (SELECT count(*) FROM ubicacion WHERE id_area = ${id}::int)::text AS ubicaciones`;
    const enUso = [
      ['área(s) que dependen de ella', uso.dependientes],
      ['usuario(s)', uso.usuarios],
      ['requerimiento(s)', uso.requerimientos],
      ['documento(s) de origen', uso.documentos],
      ['equipo(s)', uso.equipos],
      ['ubicación(es)', uso.ubicaciones],
    ]
      .filter(([, n]) => Number(n) > 0)
      .map(([etiqueta, n]) => `${n} ${etiqueta}`);
    if (enUso.length > 0) {
      throw new ConflictException(`No se puede eliminar: el área está en uso (${enUso.join(', ')}). Desactívala en su lugar.`);
    }
    await q.rows<{ id: number }>({ id: I })`DELETE FROM area WHERE id = ${id}::int RETURNING id`;
  }
  private async porId(id: number): Promise<AreaResponseDto> {
    const area = (await this.list()).find((a) => a.id === id);
    if (!area) throw new NotFoundException(`Area ${id} no encontrada`);
    return area;
  }

  /**
   * El área superior debe existir, no puede ser la misma área ni una que dependa de ella (sería un ciclo).
   * `id` es null al crear (una área nueva aún no tiene dependientes).
   */
  private async validarPadre(id: number | null, idPadre: number | null | undefined): Promise<void> {
    if (!idPadre) return;
    const q = sqlTag(this.sql);
    const [existe] = await q.rows<{ id: number }>({ id: I })`SELECT id FROM area WHERE id = ${idPadre}::int`;
    if (!existe) throw new BadRequestException('El área de la que depende no existe');
    if (id === null) return;
    if (idPadre === id) throw new BadRequestException('Un área no puede depender de sí misma');
    const [ciclo] = await q.rows<{ id: number }>({ id: I })`
      WITH RECURSIVE bajo AS (
        SELECT id FROM area WHERE id_area_padre = ${id}::int
        UNION
        SELECT a.id FROM area a JOIN bajo b ON a.id_area_padre = b.id
      )
      SELECT id FROM bajo WHERE id = ${idPadre}::int`;
    if (ciclo) throw new BadRequestException('Esa área ya depende de esta: elegirla crearía un ciclo en el organigrama');
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
