import { redondear2 } from './cuota.js';

/**
 * Imputa los pagos de una orden a sus cuotas aprobadas (plan 12, A-8/A-9). **Puro.** Un pago ligado a una cuota (`idValorizacion`) va a ella;
 * los pagos sin vínculo —los de antes del contrato o los que se hicieron sin indicarla— cubren las cuotas en orden hasta completarlas.
 * Solo sirve para mostrar el estado de cada cuota: el tope de pago se controla con los totales de la orden.
 */

export interface CuotaPorPagar {
  id: number;
  numero: number;
  neto: number;
}
export interface PagoImputable {
  monto: number;
  idValorizacion: number | null;
}
export interface CuotaImputada extends CuotaPorPagar {
  pagado: number;
  saldo: number;
  estado: 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA';
}

export function imputarPagos(cuotas: readonly CuotaPorPagar[], pagos: readonly PagoImputable[]): { cuotas: CuotaImputada[]; sobrante: number } {
  const ordenadas = [...cuotas].sort((a, b) => a.numero - b.numero);
  const pagado = new Map<number, number>(ordenadas.map((c) => [c.id, 0]));
  let libres = 0;
  for (const p of pagos) {
    if (p.idValorizacion !== null && pagado.has(p.idValorizacion)) pagado.set(p.idValorizacion, redondear2((pagado.get(p.idValorizacion) ?? 0) + p.monto));
    else libres = redondear2(libres + p.monto);
  }
  for (const c of ordenadas) {
    const falta = Math.max(redondear2(c.neto - (pagado.get(c.id) ?? 0)), 0);
    const aplica = Math.min(falta, libres);
    if (aplica > 0) {
      pagado.set(c.id, redondear2((pagado.get(c.id) ?? 0) + aplica));
      libres = redondear2(libres - aplica);
    }
  }
  const resultado = ordenadas.map<CuotaImputada>((c) => {
    const p = pagado.get(c.id) ?? 0;
    const saldo = Math.max(redondear2(c.neto - p), 0);
    return { ...c, pagado: p, saldo, estado: saldo <= 0.005 && c.neto > 0 ? 'PAGADA' : p > 0 ? 'PARCIAL' : 'SIN_PAGAR' };
  });
  return { cuotas: resultado, sobrante: libres };
}
