/**
 * Plan de conciliación de compromisos del presupuesto Meta (plan 09, §3.5). **Puro**: compara lo que debería existir
 * (los ítems adjudicados, agrupados por fase y proveedor) con lo que ya existe (FUR de adjudicación con órdenes provisionales)
 * y dice qué crear, actualizar o anular. No toca la BD: el ejecutor (`conciliar-compromisos.ts`) aplica el plan.
 */

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
  plazoEntregaDias: number | null;
  marcaModelo: string | null;
  observaciones: string | null;
}

/** Lo que se pide a un proveedor en una fase: un FUR con su(s) orden(es). */
export interface GrupoDeseado {
  clave: string;
  idDetalleFase: number;
  idFaseMaestra: number | null;
  idProveedor: number;
  idCotizacion: number;
  items: ItemDeseado[];
  /** Huella del contenido (ítems, cantidades, precios y condiciones de la cotización). */
  firma: string;
}

/** Un FUR de adjudicación vigente cuyas órdenes siguen provisionales. */
export interface GrupoExistente {
  clave: string;
  idRequerimiento: number;
  firma: string;
}

export interface PlanConciliacion {
  crear: GrupoDeseado[];
  actualizar: Array<{ existente: GrupoExistente; deseado: GrupoDeseado }>;
  anular: GrupoExistente[];
  sinCambio: number;
}

/** Fase del catálogo + proveedor: la identidad de un FUR de adjudicación. */
export function claveGrupo(idFaseMaestra: number | null, idProveedor: number, idDetalleFase: number): string {
  return `${idFaseMaestra ?? `d${idDetalleFase}`}|${idProveedor}`;
}

const n4 = (v: string | number | null | undefined): string => Number(v ?? 0).toFixed(4);
const txt = (v: string | null | undefined): string => (v ?? '').trim();

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

/** Agrupa los ítems adjudicados por (fase, proveedor). `firmaDe` arma la huella con la cabecera de la cotización del grupo. */
export function agruparDeseados(items: readonly ItemDeseado[], firmaDe: (idCotizacion: number, lineas: readonly ItemDeseado[]) => string): GrupoDeseado[] {
  const grupos = new Map<string, GrupoDeseado>();
  for (const it of items) {
    const clave = claveGrupo(it.idFaseMaestra, it.idProveedor, it.idDetalleFase);
    const g = grupos.get(clave);
    if (g) g.items.push(it);
    else grupos.set(clave, { clave, idDetalleFase: it.idDetalleFase, idFaseMaestra: it.idFaseMaestra, idProveedor: it.idProveedor, idCotizacion: it.idCotizacion, items: [it], firma: '' });
  }
  for (const g of grupos.values()) g.firma = firmaDe(g.idCotizacion, g.items);
  return [...grupos.values()];
}

/**
 * Compara lo deseado con lo existente por clave (fase + proveedor):
 *  - solo deseado → crear; solo existente → anular; en los dos → actualizar si la huella cambió, si no, sin cambio.
 * Si hay dos FUR con la misma clave (datos corruptos) se conserva el más antiguo y se anula el resto.
 */
export function planConciliacion(deseados: readonly GrupoDeseado[], existentes: readonly GrupoExistente[]): PlanConciliacion {
  const plan: PlanConciliacion = { crear: [], actualizar: [], anular: [], sinCambio: 0 };
  const porClave = new Map<string, GrupoExistente>();
  for (const e of [...existentes].sort((a, b) => a.idRequerimiento - b.idRequerimiento)) {
    if (porClave.has(e.clave)) plan.anular.push(e);
    else porClave.set(e.clave, e);
  }
  for (const d of deseados) {
    const e = porClave.get(d.clave);
    if (!e) {
      plan.crear.push(d);
      continue;
    }
    porClave.delete(d.clave);
    if (e.firma === d.firma) plan.sinCambio += 1;
    else plan.actualizar.push({ existente: e, deseado: d });
  }
  plan.anular.push(...porClave.values());
  return plan;
}
