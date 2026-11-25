/**
 * Plan de conciliación de compromisos del presupuesto Meta (plan 09, §3.5). **Puro**: compara lo que debería existir
 * (los ítems adjudicados, agrupados por fase y proveedor) con lo que ya existe (FUR de adjudicación con órdenes provisionales)
 * y dice qué crear, actualizar o anular. No toca la BD: el ejecutor (`conciliar-compromisos.ts`) aplica el plan.
 *
 * Una orden nace de **una** oferta ganadora, con sus condiciones (moneda, IGV, adelanto, forma de pago): si un proveedor gana dos subpartidas
 * de la misma fase con condiciones distintas se generan dos órdenes, cada una con las suyas (plan 12, C-1). Antes se juntaban y la orden
 * tomaba las condiciones de la primera, con el adelanto y hasta el monto equivocados.
 */

import { IGV_PCT } from '../../tesoreria/shared/tributos.js';

export type TipoProducto = 'PRODUCTO' | 'SERVICIO';
export type ClaseOrden = 'ORDEN_COMPRA' | 'ORDEN_SERVICIO';

/** Bienes van en una orden de compra y servicios en una orden de servicio. */
export function claseDe(tipo: TipoProducto): ClaseOrden {
  return tipo === 'SERVICIO' ? 'ORDEN_SERVICIO' : 'ORDEN_COMPRA';
}

/** Un ítem adjudicado que debe estar pedido. */
export interface ItemDeseado {
  idItem: number;
  idDetalleFase: number;
  /** `ppto_Fases.id` (lo que guarda `requerimiento.id_fase`); `null` si la fase del presupuesto no es del catálogo. */
  idFaseMaestra: number | null;
  idProveedor: number;
  /** `ppto_cotizacion.id` de la cotización ganadora. */
  idCotizacion: number;
  idSubfase: number;
  idProducto: number;
  tipoProducto: TipoProducto;
  /** Cantidad del ítem en el presupuesto (la que se pide, D-14). */
  cantidad: string;
  /** Costo unitario del Meta (precio referencial del FUR). */
  precioMeta: string;
  /** Precio unitario de la oferta ganadora, tal cual lo cotizó el proveedor. */
  precioCotizado: string;
  /** La oferta de este ítem ya incluye IGV (cada ítem conserva el de su cotización). */
  incluyeIgv: boolean;
  plazoEntregaDias: number | null;
  marcaModelo: string | null;
  observaciones: string | null;
}

/** Lo que se pide a un proveedor en una fase **con unas mismas condiciones**: un FUR con su(s) orden(es). */
export interface GrupoDeseado<C extends CabeceraFirma = CabeceraFirma> {
  /** Identidad completa: la base (fase y proveedor) más las condiciones. */
  clave: string;
  /** Fase y proveedor, sin las condiciones. */
  base: string;
  idDetalleFase: number;
  idFaseMaestra: number | null;
  idProveedor: number;
  /** Cotización de la que sale la cabecera (la primera del grupo). */
  idCotizacion: number;
  /** Cotizaciones ganadoras que forman el grupo (varias subpartidas pueden compartir condiciones). */
  idsCotizacion: number[];
  /** Cabecera única del grupo: las cotizaciones se funden (ver `fusionarCabeceras`). */
  cabecera: C;
  /** Ítems con el precio ya normalizado si las ofertas mezclan IGV incluido y no incluido. */
  items: ItemDeseado[];
  /** Huella del contenido (ítems, cantidades, precios y condiciones de la cotización). */
  firma: string;
}

/** Un FUR de adjudicación vigente cuyas órdenes siguen provisionales. */
export interface GrupoExistente {
  clave: string;
  base: string;
  idRequerimiento: number;
  firma: string;
}

export interface PlanConciliacion<C extends CabeceraFirma = CabeceraFirma> {
  crear: GrupoDeseado<C>[];
  actualizar: Array<{ existente: GrupoExistente; deseado: GrupoDeseado<C> }>;
  anular: GrupoExistente[];
  sinCambio: number;
}

/** Fase del catálogo + proveedor: la base de la identidad de un FUR de adjudicación. */
export function claveGrupo(idFaseMaestra: number | null, idProveedor: number, idDetalleFase: number): string {
  return `${idFaseMaestra ?? `d${idDetalleFase}`}|${idProveedor}`;
}

const n4 = (v: string | number | null | undefined): string => Number(v ?? 0).toFixed(4);
const txt = (v: string | null | undefined): string => (v ?? '').trim();

/**
 * Lo que **no** puede mezclarse en una orden: moneda, afecto al IGV, adelanto, forma y días de pago. `incluyeIgv` no entra: es propio de cada
 * ítem y se normaliza en el grupo. Los textos (garantía, condiciones, referencia) y los plazos se funden.
 */
export function claveCondiciones(c: CabeceraFirma): string {
  return [c.monedaId, c.afectoIgv ? 1 : 0, c.adelantoPorcentaje === null ? '' : n4(c.adelantoPorcentaje), txt(c.formaPago).toUpperCase(), c.diasCredito].join('~');
}

/** Identidad completa de un grupo: base + condiciones. */
export function claveCompleta(base: string, c: CabeceraFirma): string {
  return `${base}|${claveCondiciones(c)}`;
}

const unirTextos = (valores: ReadonlyArray<string | null>, tope: number): string | null => {
  const distintos = [...new Set(valores.map(txt).filter((v) => v !== ''))];
  return distintos.length === 0 ? null : distintos.join(' / ').slice(0, tope);
};

/**
 * Cabecera única de un grupo de cotizaciones con las mismas condiciones. Conserva la primera y funde lo que puede diferir: textos distintos
 * se unen, el plazo es el mayor (el más lento) y la validez la menor. Si las ofertas mezclan IGV incluido y no incluido, la cabecera dice
 * `incluyeIgv = false` (sus ítems se normalizan a precio sin IGV).
 */
export function fusionarCabeceras<C extends CabeceraFirma>(cabeceras: readonly C[]): C {
  const [primera, ...resto] = cabeceras;
  if (resto.length === 0) return primera;
  const numeros = (xs: ReadonlyArray<number | null>, f: (...v: number[]) => number): number | null => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length === 0 ? null : f(...v);
  };
  return {
    ...primera,
    fecha: cabeceras.map((c) => c.fecha).sort().at(-1) ?? primera.fecha,
    referencia: unirTextos(cabeceras.map((c) => c.referencia), 50),
    incluyeIgv: cabeceras.every((c) => c.incluyeIgv === primera.incluyeIgv) ? primera.incluyeIgv : false,
    medioPago: cabeceras.map((c) => c.medioPago).find((m) => m !== null) ?? null,
    plazoEntregaDias: numeros(cabeceras.map((c) => c.plazoEntregaDias), Math.max),
    validezDias: numeros(cabeceras.map((c) => c.validezDias), Math.min),
    garantia: unirTextos(cabeceras.map((c) => c.garantia), 100),
    condiciones: unirTextos(cabeceras.map((c) => c.condiciones), 4000),
    archivoUrl: cabeceras.map((c) => c.archivoUrl).find((u) => u !== null && txt(u) !== '') ?? null,
  };
}

/**
 * Si los ítems de un grupo mezclan ofertas con y sin IGV incluido, pasa el precio de cada uno a sin IGV (4 decimales) y el grupo queda con
 * `incluyeIgv = false`; si no, no toca nada. Es lo que evita que el precio de una oferta se lea con el IGV de otra.
 */
export function normalizarIgv(items: readonly ItemDeseado[], afectoIgv: boolean): ItemDeseado[] {
  const mezcla = new Set(items.map((i) => i.incluyeIgv)).size > 1;
  if (!mezcla) return [...items];
  return items.map((i) => (i.incluyeIgv && afectoIgv ? { ...i, precioCotizado: (Number(i.precioCotizado) / (1 + IGV_PCT / 100)).toFixed(4), incluyeIgv: false } : { ...i, incluyeIgv: false }));
}

/** Línea tal como entra en la huella: igual desde el presupuesto que desde lo ya generado. */
export interface LineaFirma {
  idItem: number;
  idProducto: number;
  idSubfase: number;
  cantidad: string;
  precioMeta: string;
  precioCotizado: string;
  plazoEntregaDias: number | null;
  marcaModelo: string | null;
  observaciones: string | null;
}

/** Condiciones de la cotización que viajan al FUR y a la orden. */
export interface CabeceraFirma {
  idProveedor: number;
  fecha: string;
  referencia: string | null;
  monedaId: string;
  monedaSimbolo: string | null;
  incluyeIgv: boolean;
  afectoIgv: boolean;
  formaPago: string;
  diasCredito: number;
  adelantoPorcentaje: string | null;
  medioPago: string | null;
  plazoEntregaDias: number | null;
  validezDias: number | null;
  garantia: string | null;
  condiciones: string | null;
  archivoUrl: string | null;
}

export function firmaGrupo(cabecera: CabeceraFirma, lineas: readonly LineaFirma[]): string {
  const c = cabecera;
  const cab = [
    c.idProveedor,
    c.fecha,
    txt(c.referencia),
    c.monedaId,
    txt(c.monedaSimbolo),
    c.incluyeIgv ? 1 : 0,
    c.afectoIgv ? 1 : 0,
    txt(c.formaPago),
    c.diasCredito,
    c.adelantoPorcentaje === null ? '' : n4(c.adelantoPorcentaje),
    txt(c.medioPago),
    c.plazoEntregaDias ?? '',
    c.validezDias ?? '',
    txt(c.garantia),
    txt(c.condiciones),
    txt(c.archivoUrl),
  ].join('~');
  const lin = [...lineas]
    .sort((a, b) => a.idItem - b.idItem)
    .map((l) =>
      [l.idItem, l.idProducto, l.idSubfase, n4(l.cantidad), n4(l.precioMeta), n4(l.precioCotizado), l.plazoEntregaDias ?? '', txt(l.marcaModelo), txt(l.observaciones)].join(':'),
    );
  return `${cab}#${lin.join(';')}`;
}

/**
 * Agrupa los ítems adjudicados por (fase, proveedor, condiciones de su cotización). `cabeceraDe` entrega la cabecera de cada cotización; las
 * cotizaciones de un mismo grupo se funden en una (`fusionarCabeceras`) y la huella se arma con ella y con los ítems ya normalizados.
 */
export function agruparDeseados<C extends CabeceraFirma>(items: readonly ItemDeseado[], cabeceraDe: (idCotizacion: number) => C): GrupoDeseado<C>[] {
  const parciales = new Map<string, { base: string; items: ItemDeseado[]; cotizaciones: number[] }>();
  for (const it of items) {
    const base = claveGrupo(it.idFaseMaestra, it.idProveedor, it.idDetalleFase);
    const clave = claveCompleta(base, cabeceraDe(it.idCotizacion));
    const p = parciales.get(clave) ?? { base, items: [], cotizaciones: [] };
    p.items.push(it);
    if (!p.cotizaciones.includes(it.idCotizacion)) p.cotizaciones.push(it.idCotizacion);
    parciales.set(clave, p);
  }
  return [...parciales.entries()].map(([clave, p]) => {
    const cabecera = fusionarCabeceras(p.cotizaciones.map(cabeceraDe));
    const normalizados = normalizarIgv(p.items, cabecera.afectoIgv);
    const primero = p.items[0];
    return {
      clave,
      base: p.base,
      idDetalleFase: primero.idDetalleFase,
      idFaseMaestra: primero.idFaseMaestra,
      idProveedor: primero.idProveedor,
      idCotizacion: primero.idCotizacion,
      idsCotizacion: p.cotizaciones,
      cabecera,
      items: normalizados,
      firma: firmaGrupo(cabecera, normalizados.map((i) => ({ ...i }))),
    };
  });
}

/**
 * Compara lo deseado con lo existente:
 *  1. Por clave completa (fase + proveedor + condiciones): en los dos → actualizar si la huella cambió, si no, sin cambio.
 *  2. Con lo que sobre, por base (fase + proveedor): si queda **un** deseado y **un** existente, es el mismo FUR al que le cambiaron las
 *     condiciones y se actualiza (conserva su número y sus órdenes); si hay varios, no se adivina cuál es cuál.
 *  3. Lo demás: solo deseado → crear; solo existente → anular.
 * Si hay dos FUR con la misma clave (datos corruptos) se conserva el más antiguo y se anula el resto.
 */
export function planConciliacion<C extends CabeceraFirma>(deseados: readonly GrupoDeseado<C>[], existentes: readonly GrupoExistente[]): PlanConciliacion<C> {
  const plan: PlanConciliacion<C> = { crear: [], actualizar: [], anular: [], sinCambio: 0 };
  const porClave = new Map<string, GrupoExistente>();
  for (const e of [...existentes].sort((a, b) => a.idRequerimiento - b.idRequerimiento)) {
    if (porClave.has(e.clave)) plan.anular.push(e);
    else porClave.set(e.clave, e);
  }
  const sinPar: Array<GrupoDeseado<C>> = [];
  for (const d of deseados) {
    const e = porClave.get(d.clave);
    if (!e) {
      sinPar.push(d);
      continue;
    }
    porClave.delete(d.clave);
    if (e.firma === d.firma) plan.sinCambio += 1;
    else plan.actualizar.push({ existente: e, deseado: d });
  }
  for (const d of sinPar) {
    const mismosDeseados = sinPar.filter((x) => x.base === d.base);
    const mismosExistentes = [...porClave.values()].filter((x) => x.base === d.base);
    if (mismosDeseados.length === 1 && mismosExistentes.length === 1) {
      porClave.delete(mismosExistentes[0].clave);
      plan.actualizar.push({ existente: mismosExistentes[0], deseado: d });
    } else {
      plan.crear.push(d);
    }
  }
  plan.anular.push(...porClave.values());
  return plan;
}
