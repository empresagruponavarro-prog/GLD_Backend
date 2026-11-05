import { ConflictException } from '@nestjs/common';
import { aDia, deDia } from './control-avance/calendario.js';
import type { OrmObra } from './control-avance/orm.js';

/**
 * Plazo de la obra (GRP S-02 y S-05): inicio, fin programado y semanas de la ficha se mantienen de acuerdo, y una vez
 * iniciada la obra ya no se editan: las variaciones van por reprogramación (que corre el plan sin tocar el original).
 */
export interface Plazo {
  inicio: string | null;
  fin: string | null;
  semanas: number | null;
}

export interface PlazoPedido {
  inicio?: string;
  fin?: string;
  semanas?: number;
}

/** Último día de una obra de `semanas` semanas que empieza en `inicio` (7 días por semana, el inicio cuenta). */
export function finPorSemanas(inicio: string, semanas: number): string {
  return deDia(aDia(inicio) + 7 * semanas - 1);
}

/** Semanas (completas o parciales, mínimo 1) que cubre el plazo `inicio`–`fin`, contando ambos extremos. */
export function semanasPorPlazo(inicio: string, fin: string): number {
  return Math.max(1, Math.ceil((aDia(fin) - aDia(inicio) + 1) / 7));
}

/**
 * Plazo resultante de un cambio, antes de que la obra inicie. Lo último que se edita manda:
 *  - cambian las **semanas** → el fin es inicio + semanas;
 *  - cambia el **fin** → las semanas son las que cubre el plazo;
 *  - cambia solo el **inicio** → el fin se corre los mismos días (se conserva la duración);
 *  - semanas y fin a la vez solo valen si coinciden.
 * Devuelve `error` cuando el pedido es incoherente.
 */
export function resolverPlazo(actual: Plazo, pedido: PlazoPedido): { plazo: Plazo; error?: string } {
  const inicio = pedido.inicio ?? actual.inicio;
  let fin = pedido.fin ?? actual.fin;
  let semanas = pedido.semanas ?? actual.semanas;

  const cambiaInicio = pedido.inicio !== undefined && pedido.inicio !== actual.inicio;
  const cambiaFin = pedido.fin !== undefined && pedido.fin !== actual.fin;
  const cambiaSemanas = pedido.semanas !== undefined && pedido.semanas !== actual.semanas;

  if (inicio && cambiaFin && cambiaSemanas) {
    const esperado = finPorSemanas(inicio, pedido.semanas as number);
    if (esperado !== pedido.fin) {
      return {
        plazo: { inicio, fin, semanas },
        error: `El fin programado (${pedido.fin}) no coincide con ${pedido.semanas} semana(s) desde el inicio (${esperado}): cambie las semanas o el fin, no ambos`,
      };
    }
  } else if (inicio && cambiaSemanas) {
    fin = finPorSemanas(inicio, pedido.semanas as number);
  } else if (inicio && cambiaFin && fin) {
    semanas = semanasPorPlazo(inicio, fin);
  } else if (cambiaInicio && inicio && actual.inicio && fin) {
    fin = deDia(aDia(fin) + (aDia(inicio) - aDia(actual.inicio)));
  }
  return { plazo: { inicio: inicio ?? null, fin: fin ?? null, semanas: semanas ?? null } };
}

/** ¿La obra ya inició? En ejecución, entregada o culminada, o con algún avance registrado. */
export function obraIniciada(estadoObra: string | null | undefined, conAvance: boolean): boolean {
  return conAvance || estadoObra === 'EN_EJECUCION' || estadoObra === 'POST_VENTA' || estadoObra === 'CULMINADO';
}

export const MSG_PLAZO_FIJO =
  'La obra ya inició: su inicio, su fin programado y sus semanas no se editan. Registre la variación como una reprogramación (conserva la fecha inicial)';

export async function cargarObraIniciada(orm: OrmObra, idCentroCosto: number): Promise<boolean> {
  const gen = await orm.obra_datos_generales.first({ id_centro_costo: idCentroCosto });
  const subs = await orm.obra_subpartida.where({ id_centro_costo: idCentroCosto }).all();
  const ids = subs.map((s) => s.id);
  const semanas = ids.length > 0 ? await orm.obra_subpartida_semana.where((w) => w.id_subpartida.in(ids)).all() : [];
  return obraIniciada(gen?.estado_obra ?? null, semanas.some((w) => w.avance != null));
}

/** 409 si la obra ya inició (el plazo es la línea base). */
export async function exigirPlazoEditable(orm: OrmObra, idCentroCosto: number): Promise<void> {
  if (await cargarObraIniciada(orm, idCentroCosto)) throw new ConflictException(MSG_PLAZO_FIJO);
}
