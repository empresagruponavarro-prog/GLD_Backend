/**
 * Costos del Presupuesto Meta (plan 11). Puro: sin Nest ni BD.
 *
 * El precio que se arma en «Presupuesto Base» (`ppto_DetalleItems.CostoUnitario`) es el BASE. El Meta es opcional y se estima en su
 * propio paso: un ítem sin precio Meta propio (`null`) tiene como Meta efectivo su Base, así que lo que nunca se toca en el Meta sigue
 * al Base sin copiar nada. El % es una calculadora: se guarda el precio resultante, no el %.
 *
 * `recalcular-meta.ts` aplica estas mismas reglas en SQL (en lote); este módulo es su especificación y la que usa el resto del código.
 */

/** Redondeo comercial a 2 decimales (misma regla que `redondear2` de `plantillas-items.handler.ts`: evita 1.005 → 1.00). */
export function redondear2(valor: number): number {
  const n = Number(valor) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Un precio Meta propio debe ser al menos de un céntimo: con 0 el ítem quedaría sin peso en el reparto de una cotización. */
export const PU_META_MINIMO = 0.01;
/** Rango del ajuste en %: -100 % o menos dejaría el precio en 0 o negativo. */
export const PORCENTAJE_MINIMO = -99.99;
export const PORCENTAJE_MAXIMO = 1000;

/** Un precio Meta propio es válido si es un número finito de al menos `PU_META_MINIMO`. */
export function esPuMetaValido(pu: number): boolean {
  return Number.isFinite(pu) && pu >= PU_META_MINIMO;
}

/** Precio unitario Meta efectivo: el propio si lo hay; si no (`null`), el Base. */
export function puMetaEfectivo(base: number, meta: number | null | undefined): number {
  return meta === null || meta === undefined ? base : meta;
}

/** Precio resultante de subir o bajar el Base un `porcentaje` (50 → +50 %, -10 → -10 %), a 2 decimales. */
export function aplicarPorcentaje(base: number, porcentaje: number): number {
  return redondear2(base * (1 + porcentaje / 100));
}

/** % que el Meta sube o baja respecto del Base, a 2 decimales; `null` si el Base es 0 (no hay sobre qué calcular). */
export function porcentajeSobreBase(base: number, meta: number): number | null {
  if (!(base > 0)) return null;
  return redondear2((meta / base - 1) * 100);
}

/** Diferencia Meta − Base (negativa = el Meta es más barato), a 2 decimales. */
export function diferenciaMeta(base: number, meta: number): number {
  return redondear2(meta - base);
}

export interface ItemParaAjuste {
  id: number;
  /** Precio unitario Base del ítem. */
  base: number;
  /** Cómo nombrar al ítem en un mensaje (su número o código). */
  etiqueta: string;
}

export interface PlanAjuste {
  /** Precio Meta que le toca a cada ítem con precio Base. */
  cambios: Array<{ id: number; pu: number }>;
  /** Ítems sin precio Base (0): no hay sobre qué aplicar el %, quedan como están. */
  sinPrecio: string[];
  /** Ítems a los que el % dejaría el precio por debajo de `PU_META_MINIMO`. Si hay alguno, el ajuste no se aplica a ninguno. */
  invalidos: string[];
}

/** Qué precio Meta le toca a cada ítem de una subfase al aplicarle un % sobre su Base (ver D-2 y D-11 del plan). */
export function planificarAjuste(items: readonly ItemParaAjuste[], porcentaje: number): PlanAjuste {
  const plan: PlanAjuste = { cambios: [], sinPrecio: [], invalidos: [] };
  for (const item of items) {
    if (!(item.base > 0)) {
      plan.sinPrecio.push(item.etiqueta);
      continue;
    }
    const pu = aplicarPorcentaje(item.base, porcentaje);
    if (esPuMetaValido(pu)) plan.cambios.push({ id: item.id, pu });
    else plan.invalidos.push(item.etiqueta);
  }
  return plan;
}

/** Total Meta de un ítem: cantidad × precio Meta efectivo, cada factor a 2 decimales (igual que el total Base). */
export function totalMetaItem(cantidad: number, base: number, meta: number | null | undefined): number {
  return redondear2(redondear2(cantidad) * redondear2(puMetaEfectivo(base, meta)));
}

/** Suma de importes a 2 decimales (ignora lo que no sea un número finito). */
export function sumarImportes(valores: readonly number[]): number {
  return redondear2(valores.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0));
}

export interface SubfaseParaMeta {
  /** Total Meta de cada uno de sus ítems. */
  itemsTotalMeta: readonly number[];
  /** Monto Meta escrito a mano (solo cuenta si la subfase no tiene ítems); `null` = igual al Base. */
  metaManual: number | null | undefined;
  /** Costo directo Base de la subfase. */
  base: number;
}

/**
 * Meta de una subfase: con ítems es la suma de ellos; sin ítems, el monto escrito a mano y, si no hay, su Base.
 */
export function metaSubfase(s: SubfaseParaMeta): number {
  if (s.itemsTotalMeta.length > 0) return sumarImportes(s.itemsTotalMeta);
  return s.metaManual ?? s.base;
}

/**
 * Meta de una fase o de un presupuesto: con hijos (subfases de una fase, fases de un presupuesto) es la suma de su Meta efectivo;
 * sin hijos no hay nada que sumar y vale lo mismo que su Base.
 */
export function metaDeHijos(hijosMeta: readonly number[], base: number): number {
  return hijosMeta.length > 0 ? sumarImportes(hijosMeta) : base;
}
