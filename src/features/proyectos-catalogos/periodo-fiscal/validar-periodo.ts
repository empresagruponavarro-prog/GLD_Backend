import { BadRequestException } from '@nestjs/common';
import type { Database } from '../../../prisma/prisma.module.js';

/**
 * Periodo de un centro de costo o un presupuesto (GRP S-11, SP-18): debe ser un año **activo** de `periodo_fiscal` y,
 * si el proyecto ya tiene fecha de inicio, **el año de esa fecha**. Función pura: devuelve el motivo o `null`.
 *
 * @param fechaInicio `YYYY-MM-DD` (o ISO) de inicio del proyecto, si la tiene.
 * @param activos años activos de `periodo_fiscal`.
 */
export function errorDePeriodo(periodo: number | null | undefined, fechaInicio: string | null | undefined, activos: readonly number[]): string | null {
  if (periodo === null || periodo === undefined) return null;
  if (!activos.includes(periodo)) {
    const lista = [...activos].sort((a, b) => a - b).join(', ') || 'ninguno';
    return `El periodo ${periodo} no está activo (periodos activos: ${lista})`;
  }
  const anio = fechaInicio ? Number(fechaInicio.slice(0, 4)) : null;
  if (anio !== null && Number.isInteger(anio) && anio !== periodo) {
    return `El periodo (${periodo}) debe ser el año de la fecha de inicio (${anio})`;
  }
  return null;
}

/** Años activos de `periodo_fiscal`. */
export async function periodosActivos(orm: Database['orm']['public']): Promise<number[]> {
  const filas = await orm.periodo_fiscal.where({ activo: true }).all();
  return filas.map((f) => f.anio);
}

/** 400 si el periodo no es válido (ver {@link errorDePeriodo}). */
export async function exigirPeriodoValido(
  orm: Database['orm']['public'],
  periodo: number | null | undefined,
  fechaInicio: string | null | undefined,
): Promise<void> {
  if (periodo === null || periodo === undefined) return;
  const motivo = errorDePeriodo(periodo, fechaInicio, await periodosActivos(orm));
  if (motivo) throw new BadRequestException(motivo);
}
