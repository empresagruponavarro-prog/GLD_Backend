/**
 * Reglas tributarias del documento de origen (plan 06, §5.5.1).
 * Son funciones puras: las tasas viven aqui para cambiarlas en un solo lugar.
 */
export const IGV_PCT = 18;
export const DETRACCION_PCT_DEFECTO = 10;
export const RETENCION_PCT = 3;
/** Importe (en soles) a partir del cual aplica detraccion o retencion. */
export const UMBRAL_SOLES = 700;

export const CLASES_DOCUMENTO = [
  'ORDEN_COMPRA',
  'ORDEN_SERVICIO',
  'PLANILLA_PERSONAL',
  'PLANILLA_OBRA',
  'CAJA_CHICA',
  'GASTO_FINANCIERO',
  'PAGO_SERVICIO',
  'OTRO',
] as const;
export type ClaseDocumento = (typeof CLASES_DOCUMENTO)[number];

/** Clases a las que se les propone detraccion. */
const CLASES_CON_DETRACCION: readonly string[] = ['ORDEN_SERVICIO', 'PAGO_SERVICIO', 'OTRO'];
/** Clases sujetas a retencion del IGV. */
const CLASES_CON_RETENCION: readonly string[] = ['ORDEN_COMPRA', 'ORDEN_SERVICIO', 'PAGO_SERVICIO', 'OTRO'];

/** Serie de correlativo por clase de documento. */
export const SERIE_POR_CLASE: Record<ClaseDocumento, string> = {
  ORDEN_COMPRA: 'OC',
  ORDEN_SERVICIO: 'OS',
  PLANILLA_PERSONAL: 'PP',
  PLANILLA_OBRA: 'PO',
  CAJA_CHICA: 'CCH',
  GASTO_FINANCIERO: 'GF',
  PAGO_SERVICIO: 'PS',
  OTRO: 'DO',
};

export function redondear(valor: number, decimales = 2): number {
  const f = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * f) / f;
}

/** Soles = simbolo vacio, `S/…` o `moneda_id` PEN (los datos historicos mezclan ids). */
export function esSoles(monedaId: string | null | undefined, simbolo: string | null | undefined): boolean {
  const s = (simbolo ?? '').trim();
  return s === '' || s.startsWith('S/') || (monedaId ?? '').toUpperCase() === 'PEN';
}

export interface EntradaTributos {
  clase: string;
  afectoIgv: boolean;
  /** Total del documento en su propia moneda. */
  total: number;
  /** Total convertido a soles (igual a `total` si el documento esta en soles). */
  totalSoles: number;
  proveedorExceptuado: boolean;
  /** `undefined` = proponer; `0` = el usuario no quiere detraccion; otro valor = porcentaje elegido. */
  detraccionPorcentaje?: number | null;
  /** Retencion fijada a mano por el usuario (la deja de recalcular). */
  retencionManual?: number | null;
}

export interface ResultadoTributos {
  detraccion_porcentaje: number | null;
  /** En soles, entero. */
  detraccion_monto: number | null;
  retencion_porcentaje: number | null;
  /** En la moneda del documento. */
  retencion_monto: number | null;
  retencion_manual: boolean;
  /** Por que aplica o no la retencion (se muestra en la UI). */
  retencion_motivo: string;
}

export function calcularTributos(e: EntradaTributos): ResultadoTributos {
  const sobreUmbral = e.totalSoles > UMBRAL_SOLES;

  // Detraccion: se propone en servicios afectos sobre el umbral; el usuario puede cambiar el % o ponerlo en 0.
  let detPct: number | null;
  if (e.detraccionPorcentaje !== undefined && e.detraccionPorcentaje !== null) {
    detPct = e.detraccionPorcentaje > 0 ? e.detraccionPorcentaje : null;
  } else if (CLASES_CON_DETRACCION.includes(e.clase) && e.afectoIgv && sobreUmbral) {
    detPct = DETRACCION_PCT_DEFECTO;
  } else {
    detPct = null;
  }
  const detMonto = detPct === null ? null : Math.round((e.totalSoles * detPct) / 100);

  // Retencion del IGV.
  if (e.retencionManual !== undefined && e.retencionManual !== null) {
    return {
      detraccion_porcentaje: detPct,
      detraccion_monto: detMonto,
      retencion_porcentaje: null,
      retencion_monto: redondear(e.retencionManual),
      retencion_manual: true,
      retencion_motivo: 'Monto ingresado manualmente',
    };
  }
  const sinRetencion = (motivo: string): ResultadoTributos => ({
    detraccion_porcentaje: detPct,
    detraccion_monto: detMonto,
    retencion_porcentaje: null,
    retencion_monto: null,
    retencion_manual: false,
    retencion_motivo: motivo,
  });
  if (!CLASES_CON_RETENCION.includes(e.clase)) return sinRetencion('No aplica: la clase de documento no se retiene');
  if (!e.afectoIgv) return sinRetencion('No aplica: operacion no afecta al IGV');
  if (e.proveedorExceptuado) return sinRetencion('No aplica: proveedor exceptuado de retencion');
  if (detPct !== null) return sinRetencion('No aplica: el documento tiene detraccion');
  if (!sobreUmbral) return sinRetencion(`No aplica: total no supera S/ ${UMBRAL_SOLES}`);
  return {
    detraccion_porcentaje: detPct,
    detraccion_monto: detMonto,
    retencion_porcentaje: RETENCION_PCT,
    retencion_monto: redondear((e.total * RETENCION_PCT) / 100),
    retencion_manual: false,
    retencion_motivo: `${RETENCION_PCT} % — proveedor no exceptuado, total mayor a S/ ${UMBRAL_SOLES}`,
  };
}

export interface EntradaNeto {
  total: number;
  renta4ta?: number | null;
  dsctoCompras?: number | null;
  dsctoIntervencion?: number | null;
  dsctoOtros?: number | null;
  /** Porcentaje de detraccion (la detraccion en la moneda del documento es total × %). */
  detraccionPorcentaje?: number | null;
  retencionMonto?: number | null;
}

/** Monto a pagar al proveedor: total menos renta 4ta, descuentos, detraccion y retencion (§3). */
export function netoProveedor(e: EntradaNeto): number {
  const detraccionDoc = e.detraccionPorcentaje ? (e.total * e.detraccionPorcentaje) / 100 : 0;
  return redondear(
    e.total -
      (e.renta4ta ?? 0) -
      (e.dsctoCompras ?? 0) -
      (e.dsctoIntervencion ?? 0) -
      (e.dsctoOtros ?? 0) -
      detraccionDoc -
      (e.retencionMonto ?? 0),
  );
}

/** Viernes? (fecha YYYY-MM-DD interpretada sin zona horaria). */
export function esViernes(fecha: string): boolean {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
}

/** Suma `dias` a una fecha YYYY-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Extrae los dias de credito de textos como "Credito 45 dias"; `null` si no hay numero o es contado. */
export function diasDeCredito(formaPago: string | null | undefined): number | null {
  if (!formaPago) return null;
  if (/contado/i.test(formaPago)) return 0;
  if (/mayor/i.test(formaPago)) return null;
  const m = formaPago.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
