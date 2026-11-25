import { redondear2 } from './cuota.js';

/**
 * Control de facturas del contratista (hoja «5) RELACION DE FACTURAS» del Excel): lo valorizado debe estar facturado. Cada cuota aprobada
 * (adelanto y valorizaciones) se factura una vez; la devolución de la garantía no entra. **Puro.**
 *
 *   VERDE    todo lo aprobado tiene factura
 *   AMARILLO solo falta la factura de la última cuota aprobada («calza lo anterior; falta facturar la actual»)
 *   ROJO     falta alguna factura anterior a la última cuota aprobada
 */

export type EstadoFacturas = 'SIN_CUOTAS' | 'AL_DIA' | 'FALTA_ACTUAL' | 'ATRASADO';

export interface CuotaParaFactura {
  id: number;
  tipo: 'ADELANTO' | 'VALORIZACION' | 'GARANTIA';
  numero: number;
  estado: string;
  /** Importe a facturar: lo facturable de la cuota más su reajuste. */
  facturable: number;
  reajuste: number;
  factura_numero: string | null;
}

export interface FilaFactura {
  id: number;
  tipo: 'ADELANTO' | 'VALORIZACION';
  numero: number;
  monto: number;
  facturada: boolean;
  factura_numero: string | null;
}

export interface ControlFacturas {
  filas: FilaFactura[];
  /** Lo aprobado a facturar y lo que ya tiene factura. */
  valorizado: number;
  facturado: number;
  pendiente: number;
  /** Lo aprobado antes de la última cuota y lo facturado de eso (la «diferencia anterior» del Excel). */
  valorizadoAnterior: number;
  facturadoAnterior: number;
  estado: EstadoFacturas;
}

export function controlarFacturas(cuotas: readonly CuotaParaFactura[]): ControlFacturas {
  const filas = cuotas
    .filter((c): c is CuotaParaFactura & { tipo: 'ADELANTO' | 'VALORIZACION' } => c.estado === 'APROBADA' && c.tipo !== 'GARANTIA')
    .sort((a, b) => (a.tipo === b.tipo ? a.numero - b.numero : a.tipo === 'ADELANTO' ? -1 : 1))
    .map<FilaFactura>((c) => ({
      id: c.id,
      tipo: c.tipo,
      numero: c.numero,
      monto: redondear2(c.facturable + c.reajuste),
      facturada: (c.factura_numero ?? '').trim() !== '',
      factura_numero: c.factura_numero,
    }));
  const suma = (xs: readonly FilaFactura[]) => redondear2(xs.reduce((a, f) => a + f.monto, 0));
  const anteriores = filas.slice(0, -1);
  const ultima = filas.at(-1);
  const valorizado = suma(filas);
  const facturado = suma(filas.filter((f) => f.facturada));
  let estado: EstadoFacturas;
  if (!ultima) estado = 'SIN_CUOTAS';
  else if (anteriores.some((f) => !f.facturada)) estado = 'ATRASADO';
  else if (!ultima.facturada) estado = 'FALTA_ACTUAL';
  else estado = 'AL_DIA';
  return {
    filas,
    valorizado,
    facturado,
    pendiente: redondear2(valorizado - facturado),
    valorizadoAnterior: suma(anteriores),
    facturadoAnterior: suma(anteriores.filter((f) => f.facturada)),
    estado,
  };
}
