/** Ítem del presupuesto tal como llega de `ppto_DetalleItems`. */
export interface ItemPresupuesto {
  id_producto: number | null;
  /** `ppto_DetalleFasesCate.id`: la subfase (categoría) a la que pertenece el ítem. */
  id_detalle_categoria: number;
  Cantidad: number | string | null;
  CostoUnitario: number | string | null;
}

/** Una línea del FUR generado: un producto dentro de una subfase. */
export interface LineaFur {
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
      lineas.set(clave, { id_producto: it.id_producto, id_ppto_detalle_categoria: it.id_detalle_categoria, cantidad, costoUnitario: costo });
    }
  }
  return [...lineas.values()];
}
