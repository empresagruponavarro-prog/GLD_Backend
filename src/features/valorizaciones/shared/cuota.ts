/**
 * Cálculo de las cuotas de un contrato de valorización (plan 12, §1.3). **Puro**: sin Nest ni BD.
 *
 * Se reparte el monto **bruto** de la orden (total con IGV) y a cada cuota se le restan su parte del adelanto y de la garantía. Repartir lo que
 * queda tras el adelanto y además restar el adelanto lo descontaría dos veces.
 *
 *   valorizado_k   = monto bruto de la valorización                        (Σ = total de la orden)
 *   amortización_k = adelanto × valorizado_k / total                       (Σ = adelanto)
 *   facturable_k   = valorizado_k − amortización_k                         (Σ de todas las filas, adelanto incluido = total)
 *   tributos_k     = renta 4.ª, detracción y retención del IGV del documento × facturable_k / total
 *   garantía_k     = fondo de garantía × valorizado_k / total              (Σ = garantía)
 *   neto_k         = facturable_k − tributos_k − garantía_k − descuentos_k
 *
 * Cada columna se calcula por **acumulado**: la cuota es el acumulado redondeado hasta ella menos lo ya repartido. Así la última cuota completa
 * exactamente cada total, nunca queda polvo de redondeo que haga negativa una cuota y el reparto de céntimos es monótono.
 */

export const redondear2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Montos del documento (orden de servicio) que se reparten entre las cuotas. Todo en la moneda de la orden, salvo `detraccionSoles`. */
export interface MontosDocumento {
  /** Total bruto (monto + IGV). */
  total: number;
  renta4ta: number;
  /** Detracción en la moneda de la orden (total × %). */
  detraccion: number;
  /** Detracción que se deposita, en soles enteros (`detraccion_monto` del documento). */
  detraccionSoles: number;
  retencionIgv: number;
}

export interface CondicionesCalculo {
  adelantoPct: number;
  garantiaPct: number;
  /** Cantidad de valorizaciones (la última es la liquidación); el adelanto no cuenta. */
  numeroValorizaciones: number;
}

export type TipoCuota = 'ADELANTO' | 'VALORIZACION';

export interface CuotaCalculada {
  tipo: TipoCuota;
  /** 0 para el adelanto; 1..N para las valorizaciones. */
  numero: number;
  valorizado: number;
  amortizacion: number;
  facturable: number;
  renta4ta: number;
  detraccion: number;
  detraccionSoles: number;
  retencionIgv: number;
  garantia: number;
  descuentos: number;
  /** Reajuste (R) con signo: se suma al neto sin tocar el reparto de tributos. */
  reajuste: number;
  neto: number;
}

/** Lo ya calculado de las cuotas anteriores (adelanto incluido): sirve para que la última cuota salga por diferencia. */
export interface Acumulado {
  valorizado: number;
  amortizacion: number;
  facturable: number;
  renta4ta: number;
  detraccion: number;
  detraccionSoles: number;
  retencionIgv: number;
  garantia: number;
}

export const ACUMULADO_VACIO: Acumulado = {
  valorizado: 0,
  amortizacion: 0,
  facturable: 0,
  renta4ta: 0,
  detraccion: 0,
  detraccionSoles: 0,
  retencionIgv: 0,
  garantia: 0,
};

/** Suma una cuota al acumulado. */
export function acumular(a: Acumulado, c: CuotaCalculada): Acumulado {
  return {
    valorizado: redondear2(a.valorizado + c.valorizado),
    amortizacion: redondear2(a.amortizacion + c.amortizacion),
    facturable: redondear2(a.facturable + c.facturable),
    renta4ta: redondear2(a.renta4ta + c.renta4ta),
    detraccion: redondear2(a.detraccion + c.detraccion),
    detraccionSoles: a.detraccionSoles + c.detraccionSoles,
    retencionIgv: redondear2(a.retencionIgv + c.retencionIgv),
    garantia: redondear2(a.garantia + c.garantia),
  };
}

/** Parte de `objetivo` que corresponde a `base` de `total`, redondeada a 2 decimales; 0 si no hay total. */
const proporcion = (objetivo: number, base: number, total: number): number => (total > 0 ? redondear2((objetivo * base) / total) : 0);
const acotar = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
/** Acumulado objetivo de una columna cuando se lleva `base` de `total`; al completar el total es exactamente el objetivo. */
const acumuladoObjetivo = (objetivo: number, base: number, total: number): number => (base >= total - 0.005 ? objetivo : proporcion(objetivo, base, total));

/** Monto del adelanto y de la garantía de una orden. */
export function montoAdelanto(doc: MontosDocumento, c: CondicionesCalculo): number {
  return redondear2((doc.total * acotar(c.adelantoPct, 0, 100)) / 100);
}
export function montoGarantia(doc: MontosDocumento, c: CondicionesCalculo): number {
  return redondear2((doc.total * acotar(c.garantiaPct, 0, 100)) / 100);
}

/** Tributos que le tocan a una cuota: el acumulado que corresponde a lo facturado hasta ella menos lo ya repartido. */
function tributosDe(doc: MontosDocumento, facturableAcumulado: number, previo: Acumulado) {
  const hasta = (objetivo: number) => acumuladoObjetivo(objetivo, facturableAcumulado, doc.total);
  return {
    renta4ta: Math.max(redondear2(hasta(doc.renta4ta) - previo.renta4ta), 0),
    detraccion: Math.max(redondear2(hasta(doc.detraccion) - previo.detraccion), 0),
    detraccionSoles: Math.max(Math.round(doc.total > 0 ? (facturableAcumulado >= doc.total - 0.005 ? doc.detraccionSoles : (doc.detraccionSoles * facturableAcumulado) / doc.total) : 0) - previo.detraccionSoles, 0),
    retencionIgv: Math.max(redondear2(hasta(doc.retencionIgv) - previo.retencionIgv), 0),
  };
}

/** El adelanto: se factura entero y no amortiza ni retiene garantía; sus tributos son los de su parte del total. */
export function calcularAdelanto(doc: MontosDocumento, c: CondicionesCalculo): CuotaCalculada {
  const facturable = montoAdelanto(doc, c);
  const t = tributosDe(doc, facturable, ACUMULADO_VACIO);
  return {
    tipo: 'ADELANTO',
    numero: 0,
    valorizado: 0,
    amortizacion: 0,
    facturable,
    ...t,
    garantia: 0,
    descuentos: 0,
    reajuste: 0,
    neto: redondear2(facturable - t.renta4ta - t.detraccion - t.retencionIgv),
  };
}

export interface ParametrosCuota {
  numero: number;
  /** Monto bruto de esta valorización (se ignora en la última, que toma todo lo pendiente). */
  valorizado: number;
  esUltima: boolean;
  /** Descuentos extraordinarios que se aplican a esta cuota (ya repartidos con `repartirDeductivos`). */
  descuentos?: number;
  /** Reajuste con signo; un reajuste negativo no puede dejar el neto bajo cero. */
  reajuste?: number;
}

/**
 * Una valorización. `previo` es lo acumulado de todas las cuotas anteriores (adelanto incluido). El `valorizado` pedido se acota a lo que
 * todavía falta valorizar; la última cuota toma todo lo pendiente.
 */
export function calcularCuota(doc: MontosDocumento, c: CondicionesCalculo, previo: Acumulado, p: ParametrosCuota): CuotaCalculada {
  const adelanto = montoAdelanto(doc, c);
  const garantiaTotal = montoGarantia(doc, c);
  const pendiente = Math.max(redondear2(doc.total - previo.valorizado), 0);
  const valorizado = p.esUltima ? pendiente : acotar(redondear2(p.valorizado), 0, pendiente);
  const valorizadoAcumulado = redondear2(previo.valorizado + valorizado);
  const amortizacion = Math.min(Math.max(redondear2(acumuladoObjetivo(adelanto, valorizadoAcumulado, doc.total) - previo.amortizacion), 0), valorizado);
  const facturable = redondear2(valorizado - amortizacion);
  const t = tributosDe(doc, redondear2(previo.facturable + facturable), previo);
  const garantia = Math.max(redondear2(acumuladoObjetivo(garantiaTotal, valorizadoAcumulado, doc.total) - previo.garantia), 0);
  const descuentos = redondear2(p.descuentos ?? 0);
  const baseNeto = redondear2(facturable - t.renta4ta - t.detraccion - t.retencionIgv - garantia);
  const reajuste = Math.max(redondear2(p.reajuste ?? 0), -Math.max(baseNeto, 0));
  return {
    tipo: 'VALORIZACION',
    numero: p.numero,
    valorizado,
    amortizacion,
    facturable,
    ...t,
    garantia,
    descuentos,
    reajuste,
    neto: redondear2(baseNeto - descuentos + reajuste),
  };
}

/** Neto de una cuota antes de aplicar descuentos: lo máximo que los deductivos pueden quitarle (nunca queda negativo). */
export function netoSinDescuentos(c: CuotaCalculada): number {
  return Math.max(redondear2(c.neto + c.descuentos), 0);
}

export interface DeductivoPendiente {
  id: number;
  /** Lo que todavía falta descontar de este deductivo. */
  pendiente: number;
}
export interface AplicacionDeductivo {
  id: number;
  monto: number;
}

/**
 * Reparte lo que cabe de los deductivos pendientes en una cuota, en el orden dado y sin pasar de `disponible`. Un deductivo que no cabe
 * entero se aplica en parte y su resto sigue pendiente para la cuota siguiente.
 */
export function repartirDeductivos(disponible: number, pendientes: readonly DeductivoPendiente[]): { aplicaciones: AplicacionDeductivo[]; total: number } {
  let queda = Math.max(redondear2(disponible), 0);
  const aplicaciones: AplicacionDeductivo[] = [];
  for (const d of pendientes) {
    if (queda <= 0) break;
    const monto = Math.min(redondear2(d.pendiente), queda);
    if (monto <= 0) continue;
    aplicaciones.push({ id: d.id, monto });
    queda = redondear2(queda - monto);
  }
  return { aplicaciones, total: redondear2(aplicaciones.reduce((a, x) => a + x.monto, 0)) };
}

export interface EntradaSugerencia {
  total: number;
  /** Lo valorizado en las cuotas anteriores. */
  valorizado: number;
  /** Cuotas que faltan, contando esta (≥ 1). */
  restantes: number;
  /** Avance real ponderado de la orden al corte (0-100); `null` = sin dato, no se libera nada. */
  avancePct: number | null;
}

/**
 * Monto que se propone valorizar: `min(pendiente ÷ cuotas restantes, total × avance − valorizado)`, nunca menos de 0 ni más de lo pendiente.
 * El plan es el máximo: adelantarse en obra no adelanta el pago. Si el contratista no cumplió, cobra lo que cumplió y la diferencia se
 * recupera sola cuando el avance la alcance. La última cuota propone todo lo pendiente.
 */
export function sugerirValorizado(e: EntradaSugerencia): number {
  const pendiente = Math.max(redondear2(e.total - e.valorizado), 0);
  if (e.restantes <= 1) return pendiente;
  const plan = redondear2(pendiente / e.restantes);
  const alcanzado = e.avancePct === null ? 0 : redondear2((e.total * acotar(e.avancePct, 0, 100)) / 100 - e.valorizado);
  return acotar(Math.min(plan, alcanzado), 0, pendiente);
}
