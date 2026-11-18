/** Ítem del presupuesto tal como llega de `ppto_DetalleItems`. */
export interface ItemPresupuesto {
  /** `ppto_DetalleItems.id` (opcional: lo usa la exclusión de ítems ya pedidos). */
  id?: number;
  id_producto: number | null;
  /** `ppto_DetalleFasesCate.id`: la subfase (categoría) a la que pertenece el ítem. */
  id_detalle_categoria: number;
  Cantidad: number | string | null;
  CostoUnitario: number | string | null;
}

/** Una línea del FUR generado: un producto dentro de una subfase. */
export interface LineaFur {
  /** Ítem del presupuesto que originó la línea (el primero si se juntaron varios). */
  id_ppto_item?: number;
  id_producto: number;
  id_ppto_detalle_categoria: number;
  cantidad: number;
  costoUnitario: number;
}

/**
 * Agrupa los ítems de una fase en líneas de FUR: **una por (producto, subfase)** (GRP S-09). Antes se sumaba por producto
 * mezclando subfases, y el gasto ya no se podía imputar. Se ignoran los ítems sin producto o sin cantidad. Si un producto
 * repite en la misma subfase se suma la cantidad y se toma el mayor costo unitario (criterio ya vigente del preview).
 * El orden es el de aparición, para que el FUR salga estable.
 */
export function agruparLineasFur(items: readonly ItemPresupuesto[]): LineaFur[] {
  const lineas = new Map<string, LineaFur>();
  for (const it of items) {
    if (!it.id_producto) continue;
    const cantidad = Number(it.Cantidad ?? 0);
    if (!(cantidad > 0)) continue;
    const costo = Number(it.CostoUnitario ?? 0);
    const clave = `${it.id_producto}|${it.id_detalle_categoria}`;
    const previa = lineas.get(clave);
    if (previa) {
      previa.cantidad += cantidad;
      previa.costoUnitario = Math.max(previa.costoUnitario, costo);
    } else {
      lineas.set(clave, {
        ...(it.id !== undefined ? { id_ppto_item: it.id } : {}),
        id_producto: it.id_producto,
        id_ppto_detalle_categoria: it.id_detalle_categoria,
        cantidad,
        costoUnitario: costo,
      });
    }
  }
  return [...lineas.values()];
}

/** Línea de un FUR vigente que pide algo del presupuesto. */
export interface LineaPedida {
  id_ppto_item: number | null;
  id_producto: number;
  id_ppto_detalle_categoria: number | null;
  /** El FUR nació de la adjudicación de cotizaciones (plan 09), no de «Generar FURs». */
  deAdjudicacion: boolean;
}

/**
 * Separa los ítems que «Generar FURs» todavía puede pedir de los que no (plan 09): quedan fuera el que ya tiene un proveedor
 * ganador (sus FUR y órdenes los genera la adjudicación) y el que ya está en una línea de un FUR vigente. Como una línea de
 * «Generar FURs» puede juntar varios ítems (mismo producto y subfase) pero guarda uno solo, también queda fuera todo ítem con
 * el mismo producto y subfase de una línea de ese tipo.
 */
export function separarItemsPedidos<T extends ItemPresupuesto & { id: number; id_ppto_cot_detalle_ganadora?: number | null }>(
  items: readonly T[],
  pedidas: readonly LineaPedida[],
): { libres: T[]; excluidos: T[] } {
  const porItem = new Set(pedidas.filter((l) => l.id_ppto_item !== null).map((l) => l.id_ppto_item));
  const porPar = new Set(
    pedidas.filter((l) => !l.deAdjudicacion && l.id_ppto_item !== null && l.id_ppto_detalle_categoria !== null).map((l) => `${l.id_producto}|${l.id_ppto_detalle_categoria}`),
  );
  const libres: T[] = [];
  const excluidos: T[] = [];
  for (const it of items) {
    const fuera = (it.id_ppto_cot_detalle_ganadora ?? null) !== null || porItem.has(it.id) || porPar.has(`${it.id_producto}|${it.id_detalle_categoria}`);
    (fuera ? excluidos : libres).push(it);
  }
  return { libres, excluidos };
}
