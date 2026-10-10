import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, B, I, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { RequerimientoHandler } from '../requerimiento/requerimiento.handler.js';
import { RequerimientoResponseDto } from '../requerimiento/requerimiento.dto.js';
import { bloquearRequerimiento, registrarEvento, validarTrabajador } from '../shared/requerimiento-eventos.js';
import {
  AnularRequerimientoDto,
  AprobarRequerimientoDto,
  EnviarRequerimientoDto,
  ObservarRequerimientoDto,
  RechazarRequerimientoDto,
} from './flujo.dto.js';

/** Transiciones del FUR: cada accion solo parte de estos estados. */
const DESDE: Record<string, readonly string[]> = {
  ENVIAR: ['BORRADOR', 'OBSERVADO'],
  OBSERVAR: ['ENVIADO'],
  APROBAR: ['ENVIADO'],
  RECHAZAR: ['ENVIADO'],
  ANULAR: ['BORRADOR', 'ENVIADO', 'OBSERVADO', 'APROBADO'],
};

@Injectable()
export class FlujoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly requerimientos: RequerimientoHandler,
  ) {}

  async enviar(id: number, dto: EnviarRequerimientoDto): Promise<RequerimientoResponseDto> {
    await this.db.transaction(async (tx) => {
      const actual = await this.bloquearYValidar(tx, id, 'ENVIAR');
      const idActor = dto.id_anexo ?? (await this.solicitanteDe(tx, id));
      if (dto.id_anexo !== undefined) await validarTrabajador(this.sql, tx, dto.id_anexo, 'id_anexo');
      await this.cambiarEstado(tx, id, 'ENVIADO');
      await registrarEvento(this.sql, tx, id, 'ENVIAR', actual.estado, 'ENVIADO', idActor, dto.comentario ?? null);
    });
    return this.requerimientos.getById(id);
  }

  async observar(id: number, dto: ObservarRequerimientoDto): Promise<RequerimientoResponseDto> {
    await this.db.transaction(async (tx) => {
      const actual = await this.bloquearYValidar(tx, id, 'OBSERVAR');
      await validarTrabajador(this.sql, tx, dto.id_aprobador, 'id_aprobador');
      await this.cambiarEstado(tx, id, 'OBSERVADO');
      await registrarEvento(this.sql, tx, id, 'OBSERVAR', actual.estado, 'OBSERVADO', dto.id_aprobador, dto.comentario);
    });
    return this.requerimientos.getById(id);
  }

  async rechazar(id: number, dto: RechazarRequerimientoDto): Promise<RequerimientoResponseDto> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const actual = await this.bloquearYValidar(tx, id, 'RECHAZAR');
      await validarTrabajador(this.sql, tx, dto.id_aprobador, 'id_aprobador');
      await q.run(tx)`
        UPDATE requerimiento SET estado = 'RECHAZADO', id_aprobador = ${dto.id_aprobador}::int,
               fecha_aprobacion = now(), comentario_aprobacion = ${dto.comentario}::text
         WHERE id = ${id}::int`;
      await registrarEvento(this.sql, tx, id, 'RECHAZAR', actual.estado, 'RECHAZADO', dto.id_aprobador, dto.comentario);
    });
    return this.requerimientos.getById(id);
  }

  async aprobar(id: number, dto: AprobarRequerimientoDto): Promise<RequerimientoResponseDto> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const actual = await this.bloquearYValidar(tx, id, 'APROBAR');
      await validarTrabajador(this.sql, tx, dto.id_aprobador, 'id_aprobador');

      const ids = (dto.lineas ?? []).map((l) => l.id_detalle);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay líneas repetidas en la aprobación');

      // Por defecto se aprueba lo pedido; luego se aplican las cantidades indicadas por el aprobador.
      await q.run(tx)`UPDATE requerimiento_detalle SET cantidad_aprobada = cantidad WHERE id_requerimiento = ${id}::int`;
      for (const l of dto.lineas ?? []) {
        const n = await q.run(tx)`
          UPDATE requerimiento_detalle SET cantidad_aprobada = ${l.cantidad_aprobada}::numeric
           WHERE id = ${l.id_detalle}::int AND id_requerimiento = ${id}::int AND ${l.cantidad_aprobada}::numeric <= cantidad`;
        if (n === 0) {
          throw new BadRequestException(
            `La línea ${l.id_detalle} no pertenece al requerimiento o la cantidad aprobada supera la solicitada`,
          );
        }
      }
      const [hay] = await q.rows<{ ok: boolean }>({ ok: B }, tx)`
        SELECT EXISTS (SELECT 1 FROM requerimiento_detalle WHERE id_requerimiento = ${id}::int AND cantidad_aprobada > 0) AS ok`;
      if (!hay.ok) throw new BadRequestException('Debe aprobarse al menos una línea con cantidad mayor a 0 (o rechazar el requerimiento)');

      await q.run(tx)`
        UPDATE requerimiento SET estado = 'APROBADO', id_aprobador = ${dto.id_aprobador}::int,
               fecha_aprobacion = now(), comentario_aprobacion = NULLIF(${dto.comentario ?? ''}::text, '')
         WHERE id = ${id}::int`;
      await registrarEvento(this.sql, tx, id, 'APROBAR', actual.estado, 'APROBADO', dto.id_aprobador, dto.comentario ?? null);
    });
    return this.requerimientos.getById(id);
  }

  async anular(id: number, dto: AnularRequerimientoDto): Promise<RequerimientoResponseDto> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const actual = await this.bloquearYValidar(tx, id, 'ANULAR');
      if (dto.id_anexo !== undefined) await validarTrabajador(this.sql, tx, dto.id_anexo, 'id_anexo');
      const [oc] = await q.rows<{ existe: boolean }>({ existe: B }, tx)`
        SELECT EXISTS (SELECT 1 FROM "documentosOrigen" WHERE id_requerimiento = ${id}::int) AS existe`;
      if (oc.existe) {
        throw new ConflictException('El requerimiento tiene órdenes de compra vinculadas; elimínelas antes de anularlo');
      }
      await this.cambiarEstado(tx, id, 'ANULADO');
      await registrarEvento(this.sql, tx, id, 'ANULAR', actual.estado, 'ANULADO', dto.id_anexo ?? null, dto.comentario ?? null);
    });
    return this.requerimientos.getById(id);
  }

  // ---------------------------------------------------------------- privado

  private async bloquearYValidar(tx: Tx, id: number, accion: keyof typeof DESDE) {
    const actual = await bloquearRequerimiento(this.sql, tx, id);
    if (!actual) throw new NotFoundException(`Requerimiento ${id} no encontrado`);
    const permitidos = DESDE[accion] as readonly string[];
    if (!permitidos.includes(actual.estado)) {
      throw new ConflictException(
        `No se puede ${String(accion).toLowerCase()} un requerimiento ${actual.estado} (estados válidos: ${permitidos.join(', ')})`,
      );
    }
    return actual;
  }

  private async cambiarEstado(tx: Tx, id: number, estado: string): Promise<void> {
    const q = sqlTag(this.sql);
    await q.run(tx)`UPDATE requerimiento SET estado = ${estado}::text WHERE id = ${id}::int`;
  }

  private async solicitanteDe(tx: Tx, id: number): Promise<number> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<{ id_solicitante: number }>({ id_solicitante: I }, tx)`
      SELECT id_solicitante FROM requerimiento WHERE id = ${id}::int`;
    return row.id_solicitante;
  }
}
