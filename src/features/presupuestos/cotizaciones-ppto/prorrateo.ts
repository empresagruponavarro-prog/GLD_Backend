import { BadRequestException } from '@nestjs/common';

/**
 * Prorrateo de la cotización de una subpartida (plan 09, cotización a nivel de subpartida): el proveedor da UN total por toda
 * la subpartida y el sistema lo reparte entre sus ítems en proporción a su costo en el Meta. Puro: sin Nest-inyección ni BD.
 */

export interface ItemParaProrrateo {
  /** `ppto_DetalleItems.id`. */
  id: number;
  /** Cantidad del ítem en el presupuesto. */
  cantidad: number;
  /** Costo total del ítem en el Meta (el peso del reparto). */
  costoTotal: number;
}

export interface LineaProrrateada {
  id_ppto_item: number;
  /** false = ítem sin cantidad en el presupuesto: no entra en la cotización. */
  cotiza: boolean;
  cantidad: string;
  /** Precio unitario tal como se guarda (misma base de IGV que el total que dio el proveedor). */
  precio_unitario: string;
  /** Parte del total que le toca al ítem (2 decimales); la suma de todos es exactamente el total. */
  monto: string;
}

const aCentimos = (n: number): number => Math.round(n * 100);
const deCentimos = (c: number): string => (c / 100).toFixed(2);

/**
 * Reparte `total` (el precio de la subpartida tal como lo dio el proveedor, con o sin IGV) entre los ítems con cantidad.
 *  - Cada ítem recibe `total × costoTotal / Σ costoTotal`, en céntimos.
 *  - El descuadre de redondeo se suma o resta al ítem de mayor peso, para que el total salga exacto.
 *  - Un ítem sin cantidad queda fuera (`cotiza = false`, monto 0); uno con cantidad pero sin costo recibe 0.
 *  - `precio_unitario = monto / cantidad` con 8 decimales.
 * Lanza 400 si el total no es mayor a 0 o si la subpartida no tiene costo en el Meta (no hay base para repartir).
 */
export function prorratearTotal(total: number, items: readonly ItemParaProrrateo[]): LineaProrrateada[] {
  if (!Number.isFinite(total) || !(total > 0)) throw new BadRequestException('El total de la cotización debe ser mayor a 0');
  const ids = items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay ítems repetidos en la subpartida');

  const conCantidad = items.filter((i) => i.cantidad > 0);
  if (conCantidad.length === 0) throw new BadRequestException('La subpartida no tiene ítems con cantidad: no hay nada que cotizar');
  const pesoTotal = conCantidad.reduce((s, i) => s + Math.max(i.costoTotal, 0), 0);
  if (!(pesoTotal > 0)) {
    throw new BadRequestException('La subpartida no tiene costo en el Meta: asigne costos a sus ítems para poder prorratear la cotización');
  }

  const totalCentimos = aCentimos(total);
  const montos = new Map<number, number>();
  for (const i of conCantidad) {
    montos.set(i.id, Math.round((totalCentimos * Math.max(i.costoTotal, 0)) / pesoTotal));
  }
  const descuadre = totalCentimos - [...montos.values()].reduce((s, c) => s + c, 0);
  if (descuadre !== 0) {
    // El ítem de mayor peso absorbe el redondeo (a igualdad, el de menor id: resultado estable).
    const mayor = [...conCantidad].sort((a, b) => b.costoTotal - a.costoTotal || a.id - b.id)[0];
    montos.set(mayor.id, (montos.get(mayor.id) ?? 0) + descuadre);
  }

  return items.map((i) => {
    if (!(i.cantidad > 0)) return { id_ppto_item: i.id, cotiza: false, cantidad: '0', precio_unitario: '0', monto: '0.00' };
    const centimos = montos.get(i.id) ?? 0;
    return {
      id_ppto_item: i.id,
      cotiza: true,
      cantidad: String(i.cantidad),
      precio_unitario: (centimos / 100 / i.cantidad).toFixed(8),
      monto: deCentimos(centimos),
    };
  });
}
