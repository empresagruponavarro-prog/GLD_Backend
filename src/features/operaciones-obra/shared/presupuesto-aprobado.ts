import { ConflictException } from '@nestjs/common';
import { esAdicional, esAprobado } from '../../presupuestos/aprobacion/estados.js';
import type { OrmObra } from './control-avance/orm.js';

/**
 * Una obra no puede iniciar ni avanzar si su presupuesto no está aprobado (GRP S-05).
 *
 * Excepción (SP-19): una obra cuyo centro de costo **no tiene presupuesto** (las que se cargaron desde el Excel de
 * control, que es la estructura que se conserva con «Importar Excel», S-03) no se bloquea: no hay nada que aprobar.
 */
export type SituacionPresupuestoObra = 'SIN_PRESUPUESTO' | 'APROBADO' | 'PENDIENTE';

export interface PresupuestoDeObra {
  tipoPpto: string | null;
  concepto: string | null;
  estado: string;
}

/** Puro: qué situación tiene el presupuesto de una obra. Los anulados no cuentan. */
export function situacionPresupuestoObra(pptos: readonly PresupuestoDeObra[]): SituacionPresupuestoObra {
  const vigentes = pptos.filter((p) => p.estado !== 'ANULADO');
  if (vigentes.length === 0) return 'SIN_PRESUPUESTO';
  return vigentes.some((p) => !esAdicional(p.tipoPpto, p.concepto) && esAprobado(p.estado)) ? 'APROBADO' : 'PENDIENTE';
}

export async function cargarSituacionPresupuesto(orm: OrmObra, idCentroCosto: number): Promise<SituacionPresupuestoObra> {
  const pptos = await orm.ppto_Principal.where({ id_centro_costo: idCentroCosto }).all();
  return situacionPresupuestoObra(pptos.map((p) => ({ tipoPpto: p.TipoPpto ?? null, concepto: p.Concepto ?? null, estado: p.estado_ppto })));
}

/** 409 si la obra tiene presupuesto pero su Principal todavía no está aprobado. */
export async function exigirPresupuestoAprobado(orm: OrmObra, idCentroCosto: number, accion: 'iniciar' | 'avanzar'): Promise<void> {
  if ((await cargarSituacionPresupuesto(orm, idCentroCosto)) === 'PENDIENTE') {
    throw new ConflictException(
      `La obra no puede ${accion === 'iniciar' ? 'iniciar' : 'registrar avance'}: su presupuesto Principal aún no está aprobado. Apruébelo en Presupuestos`,
    );
  }
}
