/**
 * Presupuesto Comercial (GRP S-01, SP-16). No se digita: se **calcula** a partir del Meta.
 *
 *  - Plan 09 (adjudicación por ítem): si algún ítem de la fase tiene un proveedor ganador, la fase vale la suma de sus ítems:
 *    cantidad × precio sin IGV de la oferta ganadora (en soles) para los adjudicados, y el costo del Meta para los demás. El Meta no cambia
 *    (respuesta 3) y la diferencia se ve por ítem.
 *  - Sin ítems adjudicados rige la regla anterior: cada fase toma el monto de la cotización ganadora de su(s) FUR (sin IGV, en soles);
 *    mientras una fase no tenga ganadora conserva el monto del Meta.
 */

export interface FaseMeta {
  /** Fase maestra (`ppto_Fases.id`) con la que se generó el FUR de la fase; si no existe, el id del detalle. */
  id_fase: number;
  nombre_fase: string;
  /** Costo directo de la fase en el presupuesto Meta. */
  meta: number;
}

export interface OfertaGanadora {
  id_fase: number;
  id_requerimiento: number;
  numero_requerimiento: string;
  estado_requerimiento: string;
  proveedor: string | null;
  /** Total sin IGV de la cotización ganadora, en soles; `null` si está en otra moneda y no hay tipo de cambio. */
  monto: number | null;
}

/** Un ítem del Meta con su proveedor ganador, si ya lo tiene. */
export interface ItemComercialEntrada {
  id_fase: number;
  id_item: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  /** Costo total del ítem en el Meta. */
  costo_meta: number;
  adjudicado: {
    proveedor: string | null;
    /** Precio unitario sin IGV de la oferta ganadora, en soles; `null` si está en otra moneda y no hay tipo de cambio. */
    precio_sin_igv: number | null;
  } | null;
}

export interface ItemComercial {
  id_item: number;
  codigo: string;
  descripcion: string;
  cantidad: number;
  meta: number;
  comercial: number;
  /** Comercial − Meta. */
  diferencia: number;
  /** Diferencia sobre el Meta, en %; `null` si el Meta es 0. */
  diferencia_pct: number | null;
  proveedor: string | null;
  adjudicado: boolean;
  sin_tipo_cambio: boolean;
}

export interface FaseComercial {
  id_fase: number;
  nombre_fase: string;
  meta: number;
  comercial: number;
  /**
   * De dónde sale el monto comercial de la fase: `ADJUDICACION` (todos los ítems con proveedor), `MIXTA` (algunos ítems con proveedor y
   * el resto al Meta), `COTIZACION` (FUR con ganadora, regla anterior) o `META`.
   */
  fuente: 'ADJUDICACION' | 'MIXTA' | 'COTIZACION' | 'META';
  /** Ítems de la fase (con la diferencia por ítem); vacío si no se pidieron. */
  items: ItemComercial[];
  items_adjudicados: number;
  /** Cotizaciones ganadoras (FUR) que la forman. */
  requerimientos: Array<{ id: number; numero: string; estado: string; proveedor: string | null; monto: number }>;
  /** Hay una ganadora que no se pudo valorizar por falta de tipo de cambio. */
  sin_tipo_cambio: boolean;
}

export interface ComercialResumen {
  fases: FaseComercial[];
  total: { meta: number; comercial: number; diferencia: number };
  /** Fases ya valorizadas con una cotización ganadora. */
  fases_cotizadas: number;
}

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Un ítem a su valor comercial: el del ganador (cantidad × precio sin IGV) o, si no lo tiene o no se pudo valorizar, el del Meta. */
function valorizarItem(i: ItemComercialEntrada): ItemComercial {
  const adjudicado = i.adjudicado !== null;
  const precio = i.adjudicado?.precio_sin_igv ?? null;
  const valorizado = adjudicado && precio !== null;
  const meta = redondear(i.costo_meta);
  const comercial = valorizado ? redondear(i.cantidad * precio) : meta;
  const diferencia = redondear(comercial - meta);
  return {
    id_item: i.id_item,
    codigo: i.codigo,
    descripcion: i.descripcion,
    cantidad: i.cantidad,
    meta,
    comercial,
    diferencia,
    diferencia_pct: meta === 0 ? null : Math.round((diferencia / meta) * 10000) / 100,
    proveedor: i.adjudicado?.proveedor ?? null,
    adjudicado: valorizado,
    sin_tipo_cambio: adjudicado && !valorizado,
  };
}

/** Puro: arma el presupuesto Comercial. El orden de las fases es el del Meta. */
export function armarComercial(
  fases: readonly FaseMeta[],
  ganadoras: readonly OfertaGanadora[],
  items: readonly ItemComercialEntrada[] = [],
): ComercialResumen {
  const porFase = new Map<number, OfertaGanadora[]>();
  for (const g of ganadoras) porFase.set(g.id_fase, [...(porFase.get(g.id_fase) ?? []), g]);

  const resultado: FaseComercial[] = fases.map((f) => {
    const itemsFase = items.filter((i) => i.id_fase === f.id_fase).map(valorizarItem);
    const conGanador = itemsFase.filter((i) => i.adjudicado || i.sin_tipo_cambio);
    if (conGanador.length > 0) {
      // Regla del plan 09: la fase vale la suma de sus ítems (los FUR de adjudicación no se suman aparte: ya están contados por ítem).
      const todos = itemsFase.every((i) => i.adjudicado);
      return {
        id_fase: f.id_fase,
        nombre_fase: f.nombre_fase,
        meta: redondear(f.meta),
        comercial: redondear(itemsFase.reduce((a, i) => a + i.comercial, 0)),
        fuente: todos ? 'ADJUDICACION' : 'MIXTA',
        items: itemsFase,
        items_adjudicados: itemsFase.filter((i) => i.adjudicado).length,
        requerimientos: [],
        sin_tipo_cambio: itemsFase.some((i) => i.sin_tipo_cambio),
      };
    }
    const ofertas = porFase.get(f.id_fase) ?? [];
    const valorizadas = ofertas.filter((o): o is OfertaGanadora & { monto: number } => o.monto !== null);
    const sinTc = ofertas.length > valorizadas.length;
    const cotizada = valorizadas.length > 0;
    return {
      id_fase: f.id_fase,
      nombre_fase: f.nombre_fase,
      meta: redondear(f.meta),
      comercial: cotizada ? redondear(valorizadas.reduce((a, o) => a + o.monto, 0)) : redondear(f.meta),
      fuente: cotizada ? 'COTIZACION' : 'META',
      items: itemsFase,
      items_adjudicados: 0,
      requerimientos: valorizadas.map((o) => ({
        id: o.id_requerimiento,
        numero: o.numero_requerimiento,
        estado: o.estado_requerimiento,
        proveedor: o.proveedor,
        monto: redondear(o.monto),
      })),
      sin_tipo_cambio: sinTc,
    };
  });

  const meta = redondear(resultado.reduce((a, f) => a + f.meta, 0));
  const comercial = redondear(resultado.reduce((a, f) => a + f.comercial, 0));
  return {
    fases: resultado,
    total: { meta, comercial, diferencia: redondear(comercial - meta) },
    fases_cotizadas: resultado.filter((f) => f.fuente !== 'META').length,
  };
}
