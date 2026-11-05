import { ConflictException } from '@nestjs/common';
import { truncar } from './control-avance/avance.js';
import { cargarObra } from './control-avance/carga-obra.js';
import { calcularObra } from './control-avance/motor.js';
import type { OrmObra } from './control-avance/orm.js';
import { hoyLima } from './obra-shared.js';

/** Avance real de una obra y si participa del control de avance (con estado y fechas). */
export interface AvanceDeObra {
  /** La obra está configurada en el control de avance; si no, no hay un avance que exigir. */
  configurada: boolean;
  real: number;
}

export async function cargarAvanceObra(orm: OrmObra, idCentroCosto: number, hoy: string = hoyLima()): Promise<AvanceDeObra> {
  const carga = await cargarObra(orm, idCentroCosto);
  if (!carga.entrada) return { configurada: false, real: 0 };
  return { configurada: true, real: calcularObra(carga.entrada, hoy).real };
}

/** La ejecución está completa: sin control de avance no hay nada que exigir; con él, el avance real llega al 100 %. */
export function ejecucionCompleta(a: AvanceDeObra): boolean {
  return !a.configurada || truncar(a.real) >= 100;
}

/** 409 si la obra no llegó al 100 % (S-11: la fecha de fin real y la liquidación se habilitan al completar la ejecución). */
export async function exigirEjecucionCompleta(orm: OrmObra, idCentroCosto: number, para: string): Promise<void> {
  const a = await cargarAvanceObra(orm, idCentroCosto);
  if (!ejecucionCompleta(a)) {
    throw new ConflictException(`No se puede ${para}: la obra está al ${truncar(a.real)} % de avance y se habilita al completar la ejecución (100 %)`);
  }
}
