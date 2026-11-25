/**
 * Presupuesto Adjudicado (plan 12, R-01): el Meta de cada ítem frente a lo que cuesta con el proveedor elegido, en soles y sin IGV, agrupado
 * fase → subfase → ítem y con la diferencia en monto y en %. Un ítem sin ganador (o cuya oferta no se pudo pasar a soles) vale lo del Meta,
 * así que su diferencia es cero y queda marcado. Cálculo puro: la lectura de la BD está en `adjudicado.handler.ts`.
 */

export interface FilaAdjudicado {
  id_fase: number;
  fase: string;
  id_subfase: number;
  subfase: string;
  id_item: number;
  codigo: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  /** Precio unitario del Meta (el propio del ítem o el del Base). */
  pu_meta: number;
  /** Proveedor ganador del ítem, si lo tiene. */
  proveedor: string | null;
  /** Precio unitario del ganador, sin IGV y en soles; `null` si no hay ganador o falta el tipo de cambio. */
  pu_adjudicado: number | null;
  /** El ganador existe pero su oferta está en otra moneda y no hay tipo de cambio. */
  sin_tipo_cambio: boolean;
}

export interface Importes {
  meta: number;
  adjudicado: number;
  diferencia: number;
  /** Diferencia sobre el Meta, en %; `null` si el Meta es 0. */
  diferencia_pct: number | null;
}

export interface ItemAdjudicado extends Importes {
  id_item: number;
  codigo: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  pu_meta: number;
  pu_adjudicado: number | null;
  proveedor: string | null;
  estado: 'ADJUDICADO' | 'SIN_ADJUDICAR' | 'SIN_TIPO_CAMBIO';
}

export interface SubfaseAdjudicada extends Importes {
  id_subfase: number;
  subfase: string;
  items: ItemAdjudicado[];
}

export interface FaseAdjudicada extends Importes {
  id_fase: number;
  fase: string;
  subfases: SubfaseAdjudicada[];
}

export interface PresupuestoAdjudicado {
  fases: FaseAdjudicada[];
  totales: Importes;
  items_total: number;
  items_adjudicados: number;
  items_sin_adjudicar: number;
  items_sin_tipo_cambio: number;
}

const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function importes(meta: number, adjudicado: number): Importes {
  const m = r2(meta);
  const a = r2(adjudicado);
  const d = r2(a - m);
  return { meta: m, adjudicado: a, diferencia: d, diferencia_pct: m === 0 ? null : Math.round((d / m) * 10000) / 100 };
}

export function armarAdjudicado(filas: readonly FilaAdjudicado[]): PresupuestoAdjudicado {
  const fases: FaseAdjudicada[] = [];
  let adjudicados = 0;
  let sinAdjudicar = 0;
  let sinTc = 0;

  for (const f of filas) {
    const parcialMeta = r2(f.cantidad * f.pu_meta);
    const conGanador = f.pu_adjudicado !== null;
    const parcialAdj = conGanador ? r2(f.cantidad * (f.pu_adjudicado as number)) : parcialMeta;
    const estado: ItemAdjudicado['estado'] = conGanador ? 'ADJUDICADO' : f.sin_tipo_cambio ? 'SIN_TIPO_CAMBIO' : 'SIN_ADJUDICAR';
    if (estado === 'ADJUDICADO') adjudicados += 1;
    else if (estado === 'SIN_TIPO_CAMBIO') sinTc += 1;
    else sinAdjudicar += 1;

    let fase = fases.find((x) => x.id_fase === f.id_fase);
    if (!fase) {
      fase = { id_fase: f.id_fase, fase: f.fase, subfases: [], ...importes(0, 0) };
      fases.push(fase);
    }
    let sub = fase.subfases.find((x) => x.id_subfase === f.id_subfase);
    if (!sub) {
      sub = { id_subfase: f.id_subfase, subfase: f.subfase, items: [], ...importes(0, 0) };
      fase.subfases.push(sub);
    }
    sub.items.push({
      id_item: f.id_item,
      codigo: f.codigo,
      descripcion: f.descripcion,
      unidad: f.unidad,
      cantidad: f.cantidad,
      pu_meta: f.pu_meta,
      pu_adjudicado: f.pu_adjudicado,
      proveedor: conGanador ? f.proveedor : null,
      estado,
      ...importes(parcialMeta, parcialAdj),
    });
  }

  // Totales de abajo hacia arriba: cada nivel suma los importes sin redondear de los ítems (ya redondeados a 2 decimales).
  const sumar = (xs: readonly Importes[]): Importes => importes(xs.reduce((a, x) => a + x.meta, 0), xs.reduce((a, x) => a + x.adjudicado, 0));
  for (const fase of fases) {
    for (const sub of fase.subfases) Object.assign(sub, sumar(sub.items));
    Object.assign(fase, sumar(fase.subfases));
  }
  return {
    fases,
    totales: sumar(fases),
    items_total: filas.length,
    items_adjudicados: adjudicados,
    items_sin_adjudicar: sinAdjudicar,
    items_sin_tipo_cambio: sinTc,
  };
}
