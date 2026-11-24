import { redondear } from '../../tesoreria/shared/tributos.js';
import type { CuotaCalculada } from './cuota.js';

/** Importe como texto con 2 decimales (convención de la API: los importes viajan como `string`). */
export const m2 = (n: number): string => redondear(n).toFixed(2);

export interface CuotaJson {
  tipo: string;
  numero: number;
  valorizado: string;
  amortizacion: string;
  facturable: string;
  renta_4ta: string;
  detraccion: string;
  detraccion_soles: string;
  retencion_igv: string;
  garantia: string;
  descuentos: string;
  neto: string;
}

/** Las columnas de una cuota calculada, como las devuelve la API. */
export function cuotaJson(c: CuotaCalculada): CuotaJson {
  return {
    tipo: c.tipo,
    numero: c.numero,
    valorizado: m2(c.valorizado),
    amortizacion: m2(c.amortizacion),
    facturable: m2(c.facturable),
    renta_4ta: m2(c.renta4ta),
    detraccion: m2(c.detraccion),
    detraccion_soles: String(c.detraccionSoles),
    retencion_igv: m2(c.retencionIgv),
    garantia: m2(c.garantia),
    descuentos: m2(c.descuentos),
    neto: m2(c.neto),
  };
}

/** Suma `meses` a una fecha `YYYY-MM-DD` (si el día no existe en el mes destino, queda en el último día del mes). */
export function sumarMeses(fecha: string, meses: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const objetivo = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)).getUTCDate();
  objetivo.setUTCDate(Math.min(d, ultimo));
  return objetivo.toISOString().slice(0, 10);
}
