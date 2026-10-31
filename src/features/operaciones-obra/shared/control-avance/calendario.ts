import type { Dia } from './control-avance.types.js';

/**
 * RC-01, RC-02, RC-07, RC-17.
 * Semanas de lunes a domingo, iguales para todas las obras; la Sem 1 es la que contiene el
 * inicio de la obra. Se trabaja de lunes a sábado (el domingo no cuenta).
 */

const MS_DIA = 86_400_000;

/** `YYYY-MM-DD` (o ISO largo) → días desde 1970-01-01. Lanza si la fecha no es válida. */
export function aDia(iso: string): Dia {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Fecha inválida: ${iso}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = ms / MS_DIA;
  if (!Number.isFinite(d) || deDia(d) !== `${m[1]}-${m[2]}-${m[3]}`) throw new Error(`Fecha inválida: ${iso}`);
  return d;
}

/** Días desde 1970-01-01 → `YYYY-MM-DD`. */
export function deDia(d: Dia): string {
  return new Date(d * MS_DIA).toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaSemana(d: Dia): number {
  return (((d + 4) % 7) + 7) % 7;
}

/** Lunes de la semana de `d`. */
export function lunesDe(d: Dia): Dia {
  return d - ((diaSemana(d) + 6) % 7);
}

/** Cantidad de domingos en `[a, b]` (1970-01-04 fue domingo: d ≡ 3 mod 7). */
function domingosEntre(a: Dia, b: Dia): number {
  return Math.floor((b - 3) / 7) - Math.floor((a - 1 - 3) / 7);
}

/** Días laborables (lunes a sábado) de `a` a `b`, ambos inclusive. 0 si `b < a`. */
export function diasLaborables(a: Dia, b: Dia): number {
  if (b < a) return 0;
  return b - a + 1 - domingosEntre(a, b);
}

/** Número de semana (1-based) de `d` respecto de `w1` (lunes de la semana 1). Puede ser ≤ 0. */
export function semanaDeFecha(w1: Dia, d: Dia): number {
  return Math.floor((d - w1) / 7) + 1;
}

export interface SemanaObra {
  /** Lunes de la semana 1. */
  w1: Dia;
  /** Domingo de la última semana cerrada: el corte. */
  corte: Dia;
  /** Domingo de la semana en curso. */
  cierreSemanaEnCurso: Dia;
  /** Semana en curso (0 si la obra aún no empieza). */
  semanaEnCurso: number;
  /** Semanas cerradas (0-16): la última semana que ya se juzga. */
  semanasCerradas: number;
}

/** Calendario de una obra respecto de `hoy`. La semana en curso aún no se juzga (RC-07). */
export function semanaObra(inicioObra: Dia, hoy: Dia, maxSemanas = 16): SemanaObra {
  const w1 = lunesDe(inicioObra);
  const lunesHoy = lunesDe(hoy);
  const k = Math.round((lunesHoy - w1) / 7) + 1;
  return {
    w1,
    corte: lunesHoy - 1,
    cierreSemanaEnCurso: lunesHoy + 6,
    semanaEnCurso: k >= 1 ? k : 0,
    semanasCerradas: Math.max(0, Math.min(maxSemanas, k - 1)),
  };
}

/** `dd/mm` para textos de pantalla. */
export function textoDiaMes(d: Dia): string {
  const iso = deDia(d);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
