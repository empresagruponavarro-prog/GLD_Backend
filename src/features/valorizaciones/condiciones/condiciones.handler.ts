import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, IN, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import type { CreateCondicionDto, UpdateCondicionDto } from './condiciones.dto.js';

export interface CondicionFila {
  id: number;
  id_categoria: number | null;
  categoria: string | null;
  adelanto_porcentaje: number;
  garantia_porcentaje: number;
  numero_valorizaciones: number;
  meses_garantia: number;
  condiciones_generales: string | null;
  condiciones_comerciales: string | null;
  estado: boolean;
}

const SPEC = {
  id: I, id_categoria: IN, categoria: TN, adelanto: T, garantia: T, numero: I, meses: I, generales: TN, comerciales: TN, estado: B,
} as const;

@Injectable()
export class CondicionesHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
  ) {}

  async listar(): Promise<CondicionFila[]> {
    const q = sqlTag(this.sql);
    const filas = await q.rows<Record<string, string | number | boolean | null>>(SPEC)`
      SELECT s.id, s.id_categoria, c.descripcion::text AS categoria, s.adelanto_porcentaje::text AS adelanto, s.garantia_porcentaje::text AS garantia,
             s.numero_valorizaciones AS numero, s.meses_garantia AS meses, s.condiciones_generales AS generales, s.condiciones_comerciales AS comerciales, s.estado
        FROM condicion_servicio s LEFT JOIN categoria c ON c.id = s.id_categoria
       ORDER BY (s.id_categoria IS NOT NULL), c.descripcion, s.id`;
    return filas.map((f) => ({
      id: f['id'] as number,
      id_categoria: f['id_categoria'] as number | null,
      categoria: f['categoria'] as string | null,
      adelanto_porcentaje: Number(f['adelanto']),
      garantia_porcentaje: Number(f['garantia']),
      numero_valorizaciones: f['numero'] as number,
      meses_garantia: f['meses'] as number,
      condiciones_generales: f['generales'] as string | null,
      condiciones_comerciales: f['comerciales'] as string | null,
      estado: f['estado'] as boolean,
    }));
  }

  async crear(dto: CreateCondicionDto): Promise<CondicionFila> {
    const id = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [dup] = await q.rows<{ id: number }>({ id: I }, tx)`
        SELECT id FROM condicion_servicio WHERE (${dto.id_categoria ?? 0}::int = 0 AND id_categoria IS NULL) OR id_categoria = ${dto.id_categoria ?? 0}::int`;
      if (dup) throw new ConflictException(dto.id_categoria === undefined ? 'Ya existen las condiciones generales: edítelas' : 'Ese tipo de servicio ya tiene condiciones: edítelas');
      if (dto.id_categoria !== undefined) {
        const [c] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM categoria WHERE id = ${dto.id_categoria}::int`;
        if (!c) throw new BadRequestException(`La categoría ${dto.id_categoria} no existe`);
      }
      const [fila] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO condicion_servicio (id_categoria, adelanto_porcentaje, garantia_porcentaje, numero_valorizaciones, meses_garantia, condiciones_generales, condiciones_comerciales, estado)
        VALUES (NULLIF(${dto.id_categoria ?? 0}::int, 0), ${String(dto.adelanto_porcentaje)}::numeric, ${String(dto.garantia_porcentaje)}::numeric, ${dto.numero_valorizaciones}::int,
                ${dto.meses_garantia}::int, NULLIF(${dto.condiciones_generales ?? ''}::text, ''), NULLIF(${dto.condiciones_comerciales ?? ''}::text, ''), ${dto.estado ?? true}::boolean)
        RETURNING id`;
      return fila.id;
    });
    return this.una(id);
  }

  async actualizar(id: number, dto: UpdateCondicionDto): Promise<CondicionFila> {
    const actual = await this.una(id);
    if (dto.id_categoria !== undefined && dto.id_categoria !== actual.id_categoria) {
      throw new BadRequestException('No se cambia el tipo de servicio de unas condiciones: cree otras');
    }
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      await q.run(tx)`
        UPDATE condicion_servicio SET
          adelanto_porcentaje = CASE WHEN ${dto.adelanto_porcentaje !== undefined}::boolean THEN ${String(dto.adelanto_porcentaje ?? 0)}::numeric ELSE adelanto_porcentaje END,
          garantia_porcentaje = CASE WHEN ${dto.garantia_porcentaje !== undefined}::boolean THEN ${String(dto.garantia_porcentaje ?? 0)}::numeric ELSE garantia_porcentaje END,
          numero_valorizaciones = CASE WHEN ${dto.numero_valorizaciones !== undefined}::boolean THEN ${dto.numero_valorizaciones ?? 3}::int ELSE numero_valorizaciones END,
          meses_garantia = CASE WHEN ${dto.meses_garantia !== undefined}::boolean THEN ${dto.meses_garantia ?? 3}::int ELSE meses_garantia END,
          condiciones_generales = CASE WHEN ${dto.condiciones_generales !== undefined}::boolean THEN ${dto.condiciones_generales ?? ''}::text ELSE condiciones_generales END,
          condiciones_comerciales = CASE WHEN ${dto.condiciones_comerciales !== undefined}::boolean THEN ${dto.condiciones_comerciales ?? ''}::text ELSE condiciones_comerciales END,
          estado = CASE WHEN ${dto.estado !== undefined}::boolean THEN ${dto.estado ?? true}::boolean ELSE estado END
         WHERE id = ${id}::int`;
    });
    return this.una(id);
  }

  private async una(id: number): Promise<CondicionFila> {
    const fila = (await this.listar()).find((c) => c.id === id);
    if (!fila) throw new NotFoundException(`Condiciones ${id} no encontradas`);
    return fila;
  }
}
