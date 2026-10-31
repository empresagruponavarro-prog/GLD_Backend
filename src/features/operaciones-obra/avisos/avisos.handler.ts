import { Inject, Injectable } from '@nestjs/common';
import { nowInstant, toInstantString } from '../../../platform/db/temporal.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { TIPOS_EVENTO_OBRA } from '../shared/control-avance/registrar-evento.js';
import type { EstadoAvisosDto, PreferenciasAvisosDto } from './avisos.dto.js';

/** Sin marca de lectura, solo cuentan los avisos de los últimos días (no todo el historial). */
export const DIAS_SIN_MARCA = 14;
const TOPE = 200;

/** `a,b` → `['a','b']`; vacío → `null` (todos). Descarta tipos que ya no existen. */
export function leerTipos(csv: string | null | undefined): string[] | null {
  const tipos = (csv ?? '').split(',').filter((t) => (TIPOS_EVENTO_OBRA as readonly string[]).includes(t));
  return tipos.length ? tipos : null;
}

/** ¿Cuenta como sin leer? Posterior a la marca de lectura (o a los últimos días si nunca marcó) y de un tipo elegido. */
export function esSinLeer(e: { tipo: string; created_at: string }, vistoHasta: string | null, tipos: readonly string[] | null, ahora: Date = new Date()): boolean {
  const desde = vistoHasta ?? new Date(ahora.getTime() - DIAS_SIN_MARCA * 86_400_000).toISOString();
  return e.created_at > desde && (tipos === null || tipos.includes(e.tipo));
}

/** Estado de lectura y preferencias de la campana de avisos de cada persona (RF-OP-49). */
@Injectable()
export class AvisosHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async estado(usuario: string): Promise<EstadoAvisosDto> {
    const orm = this.db.orm.public;
    const fila = await orm.obra_aviso_usuario.first({ id_usuario: toVarchar<255>(usuario) });
    const vistoHasta = fila?.visto_hasta ? toInstantString(fila.visto_hasta) : null;
    const tipos = leerTipos(fila?.tipos_importantes);

    const recientes = await orm.obra_evento.orderBy((e) => e.id.desc()).limit(TOPE).all();
    const noLeidos = recientes.filter((e) => esSinLeer({ tipo: e.tipo, created_at: toInstantString(e.created_at) }, vistoHasta, tipos)).length;
    return { visto_hasta: vistoHasta, tipos_importantes: tipos, no_leidos: noLeidos };
  }

  /** Marca todo lo ocurrido hasta ahora como leído. */
  async marcarLeidos(usuario: string): Promise<EstadoAvisosDto> {
    await this.guardar(usuario, { visto_hasta: nowInstant() });
    return this.estado(usuario);
  }

  async guardarPreferencias(usuario: string, dto: PreferenciasAvisosDto): Promise<EstadoAvisosDto> {
    const csv = dto.tipos_importantes?.length ? dto.tipos_importantes.join(',') : null;
    await this.guardar(usuario, { tipos_importantes: csv === null ? null : toVarchar<200>(csv) });
    return this.estado(usuario);
  }

  private async guardar(usuario: string, cambios: { visto_hasta?: ReturnType<typeof nowInstant>; tipos_importantes?: ReturnType<typeof toVarchar<200>> | null }): Promise<void> {
    const orm = this.db.orm.public;
    const id = toVarchar<255>(usuario);
    const existente = await orm.obra_aviso_usuario.first({ id_usuario: id });
    if (existente) await orm.obra_aviso_usuario.where({ id_usuario: id }).update({ ...cambios, updated_at: nowInstant() });
    else await orm.obra_aviso_usuario.create({ id_usuario: id, ...cambios });
  }
}
