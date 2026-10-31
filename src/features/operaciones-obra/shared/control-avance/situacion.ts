import { truncar } from './avance.js';
import { TOLERANCIA_PP, type Dia, type EstadoObra, type Situacion } from './control-avance.types.js';

/**
 * RC-12 y RC-13. La situación NO la elige el usuario: se calcula.
 */

/** Obras que se miden contra un cronograma (las «próximas» también: aún no inician). */
export function enEjecucion(estado: EstadoObra): boolean {
  return estado === 'EN_EJECUCION' || estado === 'PROXIMO';
}

export interface EntradaSituacion {
  /** `obra` aplica además En pausa, Entregada y Por entregar; `item` es subpartida o partida. */
  nivel: 'obra' | 'item';
  estado: EstadoObra;
  real: number;
  /** Programado al corte (cierre de la semana anterior). */
  programado: number;
  /** Programado al cierre de la semana en curso. */
  programadoFinSemana: number;
  inicio: Dia;
  hoy: Dia;
  semanaEnCurso: number;
  /** Va al día en promedio pero alguna subpartida está retrasada. */
  riesgo: boolean;
  /** Hoy cae dentro de una reprogramación (solo obra). */
  enPausa?: boolean;
  /** Fin de control: una obra al 100 % sin entregar pasada esta fecha se marca en ámbar. */
  finControl?: Dia;
}

const S = (clave: Situacion['clave'], texto: string): Situacion => ({ clave, texto });

/**
 * RC-12: se evalúa en este orden y gana la primera regla que se cumple.
 *  1 Suspendida / Cancelada · 2 En pausa (obra) · 3 Entregada (obra post venta o culminada)
 *  4 Completada / Por entregar · 5 Por iniciar · 6 Retrasada · 7 En riesgo
 *  8 Al día · Sem N en curso · 9 A tiempo.
 * Tolerancia de 0,5 pp (solo redondeos): una semana cerrada no cumplida es Retrasada; la semana
 * en curso todavía no se juzga.
 */
export function situacion(e: EntradaSituacion): Situacion {
  if (e.estado === 'SUSPENDIDA') return S('neutral', 'Suspendida');
  if (e.estado === 'CANCELADA') return S('neutral', 'Cancelada');
  if (e.nivel === 'obra' && enEjecucion(e.estado) && e.enPausa) return S('rp', 'En pausa');
  if (e.nivel === 'obra' && (e.estado === 'POST_VENTA' || e.estado === 'CULMINADO')) return S('good', 'Entregada');

  if (truncar(e.real) >= 100) {
    if (e.nivel === 'obra' && enEjecucion(e.estado)) {
      return S(e.finControl !== undefined && e.hoy > e.finControl ? 'warn' : 'good', 'Por entregar');
    }
    return S('good', 'Completada');
  }
  if (e.inicio > e.hoy && e.real <= 0) return S('neutral', 'Por iniciar');
  if (e.real + TOLERANCIA_PP < e.programado) return S('crit', 'Retrasada');
  if (e.riesgo) return S('warn', 'En riesgo');
  if (e.real + TOLERANCIA_PP < e.programadoFinSemana) {
    return S('neutral', e.semanaEnCurso > 0 ? `Al día · Sem ${e.semanaEnCurso} en curso` : 'Al día · en curso');
  }
  return S('good', 'A tiempo');
}

export interface EntradaEstadoCronograma {
  nivel: 'obra' | 'item';
  estado: EstadoObra;
  real: number;
  /** Programado al corte. */
  programado: number;
  inicio: Dia;
  /** Corte: domingo de la última semana cerrada. */
  corte: Dia;
  enPausa?: boolean;
}

/**
 * RC-13: estado del cronograma «como en MS Project», juzgado al corte:
 * Completada · Tarea futura (empieza después del corte) · Retrasada · A tiempo.
 */
export function estadoCronograma(e: EntradaEstadoCronograma): Situacion {
  if (e.estado === 'SUSPENDIDA') return S('neutral', 'Suspendida');
  if (e.estado === 'CANCELADA') return S('neutral', 'Cancelada');
  if (e.nivel === 'obra' && enEjecucion(e.estado) && e.enPausa) return S('rp', 'En pausa');
  if (!enEjecucion(e.estado) || e.real >= 99.95) return S('good', 'Completada');
  if (e.inicio > e.corte) return S('neutral', 'Tarea futura');
  if (e.real + TOLERANCIA_PP < e.programado) return S('crit', 'Retrasada');
  return S('good', 'A tiempo');
}

/** En la vista Partidas, «Al día · Sem N en curso» se muestra como «A tiempo» (la semana va aparte). */
export function sinSemana(s: Situacion): Situacion {
  return s.texto.startsWith('Al día') ? S('good', 'A tiempo') : s;
}
