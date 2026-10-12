import { BadRequestException, NotFoundException } from '@nestjs/common';
import { toInstantString } from '../../../platform/db/temporal.js';
import type { Database } from '../../../prisma/prisma.module.js';

/** Estados válidos de una semana del cronograma. */
export const ESTADOS_SEMANA = ['Programado', 'En Plazo', 'Retrasado', 'Completado'] as const;
/** Prioridades válidas de incidencias / RFI. */
export const PRIORIDADES_INCIDENCIA = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
/** Estados válidos de incidencias / RFI. */
export const ESTADOS_INCIDENCIA = ['PENDIENTE', 'EN PROCESO', 'RESUELTA'] as const;

/** Verifica que el centro de costo exista; lanza 404 si no. */
export async function assertCentroCosto(db: Database, idCentroCosto: number) {
  const cc = await db.orm.public.CentroCostos.first({ id: idCentroCosto });
  if (!cc) throw new NotFoundException(`Centro de Costo ${idCentroCosto} no encontrado`);
  return cc;
}

/** Normaliza una fecha 'YYYY-MM-DD' (o ISO) para columnas DateString. */
export function toDateOnly(value: string | null | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined;
  const v = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException(`Fecha inválida: ${value}`);
  return v;
}

/** Lee una columna DateString/Date como 'YYYY-MM-DD'. */
export function readDateOnly(value: unknown): string {
  if (value == null) return '';
  return toInstantString(value).slice(0, 10);
}

/** Elimina las claves con valor `undefined` para no sobrescribir columnas en un UPDATE parcial. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function etiquetaSemana(numero: number): string {
  return `SEM ${numero.toString().padStart(2, '0')}`;
}

export function whatsappUrl(telefono: string | null | undefined): string | undefined {
  if (!telefono) return undefined;
  const digits = telefono.replace(/[^0-9]/g, '');
  if (!digits) return undefined;
  // Si es un celular peruano de 9 dígitos sin prefijo, anteponer 51
  return `https://wa.me/${digits.length === 9 ? `51${digits}` : digits}`;
}
