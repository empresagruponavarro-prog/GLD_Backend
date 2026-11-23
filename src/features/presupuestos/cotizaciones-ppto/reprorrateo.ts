import type { LineaProrrateada } from './prorrateo.js';

/**
 * Reglas puras para volver a repartir las cotizaciones de una subpartida cuando cambia lo que las sostiene (el precio Meta de sus ítems,
 * sus cantidades o los ítems mismos; plan 11, D-5). Sin Nest-inyección ni BD: reciben lo ya leído.
 */

/** Una línea de cotización tal como está guardada. */
export interface LineaGuardada {
  id_ppto_item: number;
  cotiza: boolean;
  cantidad: number;
  precio_unitario: number;
}

export interface ComparacionLineas {
  /** Hay algo distinto: una línea que sobra o falta, o un cotiza / cantidad / precio que cambió. Sin cambio no se reescribe nada. */
  cambio: boolean;
  /**
   * Ítems que **entran** a la cotización ahora: no tenían línea, o la tenían sin cotizar (cantidad 0) y ahora sí. Son los únicos que se
   * suman al proveedor que ya gana la subpartida. Un ítem que ya cotizaba y perdió su ganador (porque se cambió su producto) **no** está
   * aquí: el cambio de producto suelta el ganador a propósito y se vuelve a elegir (plan 09, D-14).
   */
  ingresan: number[];
}

/** Los importes se guardan como `numeric` sin escala; la tolerancia solo absorbe la conversión texto → número. */
const EPS = 1e-9;
const igual = (a: number, b: number) => Math.abs(a - b) < EPS;

/** Compara las líneas guardadas de una cotización con las que salen del nuevo reparto. */
export function compararLineas(guardadas: readonly LineaGuardada[], nuevas: readonly LineaProrrateada[]): ComparacionLineas {
  const previas = new Map(guardadas.map((g) => [g.id_ppto_item, g]));
  const idsNuevos = new Set(nuevas.map((n) => n.id_ppto_item));

  let cambio = guardadas.some((g) => !idsNuevos.has(g.id_ppto_item));
  const ingresan: number[] = [];
  for (const n of nuevas) {
    const previa = previas.get(n.id_ppto_item);
    if (!previa) {
      cambio = true;
      if (n.cotiza) ingresan.push(n.id_ppto_item);
      continue;
    }
    if (previa.cotiza !== n.cotiza || !igual(previa.cantidad, Number(n.cantidad)) || !igual(previa.precio_unitario, Number(n.precio_unitario))) {
      cambio = true;
    }
    if (n.cotiza && !previa.cotiza) ingresan.push(n.id_ppto_item);
  }
  return { cambio, ingresan };
}

/** Por qué una cotización no se volvió a repartir. */
export type MotivoOmitida = 'ORDEN_REGISTRADA' | 'SIN_BASE_PARA_REPARTIR';

export interface CotizacionOmitida {
  id_cotizacion: number;
  numero: string;
  motivo: MotivoOmitida;
}

export interface ResultadoReprorrateo {
  /** Cotizaciones cuyas líneas se rehicieron (solo las que realmente cambiaron). */
  actualizadas: number;
  omitidas: CotizacionOmitida[];
}
