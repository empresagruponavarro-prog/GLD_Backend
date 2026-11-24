import { redondear2 } from './cuota.js';

/**
 * Foto por partida de una valorización (plan 12, R-13): código, monto de la línea, avance acumulado, lo valorizado antes y lo de ahora.
 * **Puro.** El monto de la cuota lo decide el esquema (plan o supervisor); aquí solo se **reparte** entre las líneas de la orden para que el
 * documento muestre de dónde sale, y la suma de las partes siempre es exacta.
 */

export interface LineaOrden {
  id: number;
  /** Monto de la línea en la orden, sin IGV. */
  monto: number;
  /** Avance acumulado de la partida al corte (0-100); `null` = la obra no la tiene y no se cargó a mano. */
  avancePct: number | null;
  /** El avance se escribió a mano en la valorización (la obra no lo informa). */
  manual?: boolean;
  /** Lo valorizado de esta línea en las valorizaciones anteriores, en la misma unidad de la cuota (bruto). */
  montoAnterior: number;
}

export interface LineaValorizada {
  id: number;
  avanceAcumulado: number;
  avanceManual: boolean;
  montoAnterior: number;
  montoPresente: number;
  /** Anterior + presente. */
  montoAcumulado: number;
  /** Lo que falta valorizar de la línea tras esta cuota. */
  saldo: number;
}

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Reparte `valorizado` (bruto de la cuota) entre las líneas en proporción a lo que cada una avanzó desde la cuota anterior
 * (`monto × avance − anterior`); si ninguna avanzó, en proporción a su monto. La última línea con parte absorbe el redondeo.
 * `totalOrden` es el bruto de toda la orden: pasa el monto de cada línea (sin IGV) a la misma unidad que `valorizado`.
 */
export function valorizarLineas(lineas: readonly LineaOrden[], valorizado: number, totalOrden: number): LineaValorizada[] {
  const sumaMontos = lineas.reduce((a, l) => a + Math.max(l.monto, 0), 0);
  const factor = sumaMontos > 0 ? totalOrden / sumaMontos : 0;
  const bruto = (l: LineaOrden) => Math.max(l.monto, 0) * factor;
  const avance = (l: LineaOrden) => acotar(l.avancePct ?? 0, 0, 100);

  const alcanzado = lineas.map((l) => Math.max((bruto(l) * avance(l)) / 100 - l.montoAnterior, 0));
  const hayAvance = alcanzado.some((a) => a > 0.005);
  const pesos = hayAvance ? alcanzado : lineas.map((l) => bruto(l));
  const sumaPesos = pesos.reduce((a, p) => a + p, 0);

  const partes = lineas.map((_, i) => (sumaPesos > 0 ? redondear2((valorizado * pesos[i]) / sumaPesos) : 0));
  if (sumaPesos > 0 && partes.length > 0) {
    const ultima = pesos.reduce((u, p, i) => (p > 0 ? i : u), -1);
    if (ultima >= 0) {
      const otras = partes.reduce((a, p, i) => (i === ultima ? a : a + p), 0);
      partes[ultima] = Math.max(redondear2(valorizado - otras), 0);
    }
  }

  return lineas.map((l, i) => {
    const acumulado = redondear2(l.montoAnterior + partes[i]);
    return {
      id: l.id,
      avanceAcumulado: avance(l),
      avanceManual: l.manual ?? false,
      montoAnterior: l.montoAnterior,
      montoPresente: partes[i],
      montoAcumulado: acumulado,
      saldo: Math.max(redondear2(bruto(l) - acumulado), 0),
    };
  });
}

/** Avance de la orden: el de cada línea ponderado por su monto; `null` si ninguna línea tiene dato. */
export function avancePonderado(lineas: readonly Pick<LineaOrden, 'monto' | 'avancePct'>[]): number | null {
  const conDato = lineas.filter((l) => l.avancePct !== null);
  if (conDato.length === 0) return null;
  const total = lineas.reduce((a, l) => a + Math.max(l.monto, 0), 0);
  if (total <= 0) return 0;
  const valorizado = lineas.reduce((a, l) => a + Math.max(l.monto, 0) * acotar(l.avancePct ?? 0, 0, 100), 0);
  return redondear2(valorizado / total);
}
