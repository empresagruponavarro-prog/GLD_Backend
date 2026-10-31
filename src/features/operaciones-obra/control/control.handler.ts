import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { toInstantString } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { cargarObra } from '../shared/control-avance/carga-obra.js';
import { cargarEquipo } from '../shared/control-avance/equipo.js';
import { calcularCurvaS, calcularObra } from '../shared/control-avance/motor.js';
import { assertCentroCosto, esFechaIso, hoyLima } from '../shared/obra-shared.js';
import type { ControlObraDto, CurvaSDto, ObraEventoDto } from './control.dto.js';

function validarHoy(hoy: string | undefined): string {
  const fecha = hoy ?? hoyLima();
  if (!esFechaIso(fecha)) throw new BadRequestException(`Fecha inválida: ${fecha}`);
  return fecha;
}

@Injectable()
export class ControlHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Ficha operativa + todo lo que calcula el motor para la obra. */
  async obtener(idCentroCosto: number, hoyParam?: string): Promise<ControlObraDto> {
    const hoy = validarHoy(hoyParam);
    await assertCentroCosto(this.db, idCentroCosto);
    const orm = this.db.orm.public;
    const [carga, gen] = await Promise.all([cargarObra(orm, idCentroCosto), orm.obra_datos_generales.first({ id_centro_costo: idCentroCosto })]);
    return {
      id_centro_costo: idCentroCosto,
      hoy,
      configurada: carga.entrada !== null,
      faltantes: carga.faltantes,
      estado_obra: carga.estadoObra,
      ficha: {
        codigo_obra: gen?.codigo_obra ?? null,
        tienda: gen?.tienda ?? null,
        departamento: gen?.departamento ?? null,
        comentario: gen?.comentario ?? null,
        equipo: await cargarEquipo(orm, gen),
      },
      resultado: carga.entrada ? calcularObra(carga.entrada, hoy) : null,
    };
  }

  /** Curva S de la obra con el filtro Todo · Contractual · Adicionales (RC-22/23). */
  async curvaS(idCentroCosto: number, tipo: 'todo' | 'C' | 'A' = 'todo', hoyParam?: string): Promise<CurvaSDto> {
    const hoy = validarHoy(hoyParam);
    await assertCentroCosto(this.db, idCentroCosto);
    const carga = await cargarObra(this.db.orm.public, idCentroCosto);
    return carga.entrada ? calcularCurvaS(carga.entrada, hoy, tipo) : null;
  }

  /** Historial de cambios de la obra, del más reciente al más antiguo. */
  async eventos(idCentroCosto: number, limite = 50): Promise<ObraEventoDto[]> {
    await assertCentroCosto(this.db, idCentroCosto);
    const filas = await this.db.orm.public.obra_evento
      .where({ id_centro_costo: idCentroCosto })
      .orderBy((e) => e.id.desc())
      .limit(Math.min(Math.max(limite, 1), 200))
      .all();
    return filas.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      titulo: e.titulo,
      detalle: e.detalle ?? null,
      valor_antes: e.valor_antes ?? null,
      valor_despues: e.valor_despues ?? null,
      severidad: e.severidad,
      usuario: e.usuario ?? null,
      created_at: toInstantString(e.created_at),
    }));
  }
}
