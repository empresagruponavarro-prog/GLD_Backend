/**
 * Presupuesto Comercial (GRP S-01, SP-16). No se digita: se **calcula** a partir del Meta. Cada fase toma el monto de la
 * cotización ganadora de su(s) FUR (sin IGV, en soles); mientras una fase no tenga ganadora conserva el monto del Meta.
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

export interface FaseComercial {
  id_fase: number;
  nombre_fase: string;
  meta: number;
  comercial: number;
  /** De dónde sale el monto comercial de la fase. */
  fuente: 'COTIZACION' | 'META';
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

/** Puro: arma el presupuesto Comercial. El orden de las fases es el del Meta. */
export function armarComercial(fases: readonly FaseMeta[], ganadoras: readonly OfertaGanadora[]): ComercialResumen {
  const porFase = new Map<number, OfertaGanadora[]>();
  for (const g of ganadoras) porFase.set(g.id_fase, [...(porFase.get(g.id_fase) ?? []), g]);

  const resultado: FaseComercial[] = fases.map((f) => {
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
    fases_cotizadas: resultado.filter((f) => f.fuente === 'COTIZACION').length,
  };
}
