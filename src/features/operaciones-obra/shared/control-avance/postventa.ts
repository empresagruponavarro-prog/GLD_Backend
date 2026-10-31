import type { Dia } from './control-avance.types.js';

/** RC-18 y RC-19. */

export interface InfoPostVenta {
  inicio: Dia;
  cierre: Dia | null;
  dias: number;
  cerrada: boolean;
  texto: string;
}

/**
 * RC-18: la post venta empieza en la entrega real (si falta, en el fin original). Días = (cierre
 * o hoy) − inicio. «En curso» mientras no tenga cierre.
 */
export function postVenta(entregaReal: Dia | null, finOriginal: Dia, cierre: Dia | null, hoy: Dia): InfoPostVenta {
  const inicio = entregaReal ?? finOriginal;
  const cierreValido = cierre !== null && cierre >= inicio ? cierre : null; // un cierre anterior a la entrega se ignora (RV-20)
  const dias = Math.max(0, (cierreValido ?? hoy) - inicio);
  return {
    inicio,
    cierre: cierreValido,
    dias,
    cerrada: cierreValido !== null,
    texto: cierreValido !== null ? `Cerrada en ${dias} días` : 'En curso',
  };
}

export interface CumplimientoEntrega {
  /** Entrega − fin vigente (días; ≤ 0 = a tiempo). */
  desfase: number;
  aTiempo: boolean;
  /** Duración de la post venta, si se cerró. */
  diasPostVenta: number | null;
}

/** RC-19: entrega frente al fin vigente de una obra culminada. */
export function cumplimientoEntrega(entrega: Dia, finVigente: Dia, cierrePostVenta: Dia | null): CumplimientoEntrega {
  const desfase = entrega - finVigente;
  return { desfase, aTiempo: desfase <= 0, diasPostVenta: cierrePostVenta !== null ? cierrePostVenta - entrega : null };
}

/** % de obras entregadas a tiempo, 0-100 redondeado. */
export function porcentajeATiempo(culminadas: readonly CumplimientoEntrega[]): number {
  if (culminadas.length === 0) return 0;
  return Math.round((culminadas.filter((c) => c.aTiempo).length / culminadas.length) * 100);
}
