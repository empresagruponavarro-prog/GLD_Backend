import { IGV_PCT, redondear } from '../../tesoreria/shared/tributos.js';

/**
 * Precios y totales de una oferta de proveedor. Puro (sin Nest ni BD): lo comparten las cotizaciones de un
 * FUR (`requerimientos/cotizaciones/`) y las del presupuesto Meta (`presupuestos/cotizaciones-ppto/`).
 */

/** Precio sin y con IGV de una oferta (el proveedor puede cotizar con o sin IGV; los no afectos no tienen IGV). */
export function preciosOferta(precio: number, incluyeIgv: boolean, afecto: boolean): { sin: number; con: number } {
  const sin = incluyeIgv && afecto ? precio / (1 + IGV_PCT / 100) : precio;
  const con = afecto ? sin * (1 + IGV_PCT / 100) : sin;
  return { sin, con };
}

/** Totales de una cotizacion a partir de sus lineas cotizadas. */
export function totalesCotizacion(
  lineas: Array<{ cotiza: boolean; cantidad: number; precio: number }>,
  incluyeIgv: boolean,
  afecto: boolean,
): { subtotal: number; igv: number; total: number } {
  const subtotal = redondear(
    lineas.filter((l) => l.cotiza).reduce((a, l) => a + l.cantidad * preciosOferta(l.precio, incluyeIgv, afecto).sin, 0),
  );
  const igv = afecto ? redondear((subtotal * IGV_PCT) / 100) : 0;
  return { subtotal, igv, total: redondear(subtotal + igv) };
}
