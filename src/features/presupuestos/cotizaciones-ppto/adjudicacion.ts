import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Reglas puras de las cotizaciones y la adjudicación por ítem del presupuesto Meta (plan 09, §3.4).
 * Sin Nest-inyección ni BD: reciben lo ya leído y lanzan 400/409.
 */

/** Tolerancia al comparar cantidades (los ítems guardan 2 decimales). */
const EPS = 0.005;

/**
 *  - `LIBRE`: el presupuesto todavía se edita (desarrollo, revisión, observado): se cotiza y adjudica todo.
 *  - `SOLO_NO_CUBIERTOS`: presupuesto aprobado (D-12): solo se readjudican los ítems cuya orden se anuló.
 */
export type ModoCotizacion = 'LIBRE' | 'SOLO_NO_CUBIERTOS';

const EDITABLES = ['EN_DESARROLLO', 'EN_REVISION', 'OBSERVADO'];

export function modoCotizacion(estadoPpto: string): ModoCotizacion {
  if (EDITABLES.includes(estadoPpto)) return 'LIBRE';
  if (estadoPpto === 'APROBADO') return 'SOLO_NO_CUBIERTOS';
  throw new ConflictException(`El presupuesto está ${estadoPpto}: ya no admite cotizaciones ni cambios de proveedor`);
}

/** Un ítem de la fase tal como lo ve la validación. `cubierto` = ya tiene una orden de compra o de servicio REGISTRADA. */
export interface ItemFase {
  id: number;
  /** Cantidad del ítem en el presupuesto. */
  cantidad: number;
  cubierto: boolean;
  /** Texto para los mensajes (código del producto). */
  etiqueta: string;
}

export interface LineaEntrada {
  id_ppto_item: number;
  cotiza?: boolean;
  cantidad: string;
}

/** La línea cotiza la cantidad completa del ítem (D-3 / respuesta 5: un ítem no se reparte). */
export function cantidadCompleta(cantidadCotizada: number, cantidadItem: number): boolean {
  return Math.abs(cantidadCotizada - cantidadItem) < EPS;
}

/** Valida las líneas de una cotización contra los ítems de su fase. */
export function validarLineasCotizacion(lineas: readonly LineaEntrada[], items: ReadonlyMap<number, ItemFase>, modo: ModoCotizacion): void {
  const ids = lineas.map((l) => l.id_ppto_item);
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay ítems repetidos en la cotización');

  for (const l of lineas) {
    const item = items.get(l.id_ppto_item);
    if (!item) throw new BadRequestException(`El ítem ${l.id_ppto_item} no pertenece a la fase que se cotiza`);
    if (modo === 'SOLO_NO_CUBIERTOS' && item.cubierto) {
      throw new ConflictException(`El ítem ${item.etiqueta} ya tiene una orden registrada: anule la orden antes de cotizarlo de nuevo`);
    }
    if (l.cotiza === false) continue;
    const cantidad = Number(l.cantidad);
    if (!(cantidad > 0)) throw new BadRequestException(`La cantidad cotizada de ${item.etiqueta} debe ser mayor a 0`);
    if (cantidad > item.cantidad + EPS) {
      throw new BadRequestException(`La cantidad cotizada de ${item.etiqueta} (${l.cantidad}) supera la del presupuesto (${item.cantidad})`);
    }
  }
  if (lineas.every((l) => l.cotiza === false)) throw new BadRequestException('La cotización debe ofrecer al menos un ítem');
}

/** Una línea solo puede ganar su ítem si ofrece la cantidad completa y el ítem no tiene una orden registrada. */
export function validarAdjudicable(item: ItemFase, linea: { cotiza: boolean; cantidad: number }): void {
  if (item.cubierto) {
    throw new ConflictException(`El ítem ${item.etiqueta} ya tiene una orden registrada: anúlela antes de cambiar su proveedor`);
  }
  if (!linea.cotiza) throw new BadRequestException(`El proveedor no ofrece el ítem ${item.etiqueta}: no se puede adjudicar`);
  if (!cantidadCompleta(linea.cantidad, item.cantidad)) {
    throw new BadRequestException(
      `El proveedor cotizó ${linea.cantidad} de ${item.etiqueta} y el presupuesto pide ${item.cantidad}: un ítem se adjudica completo a un solo proveedor (respuesta 5)`,
    );
  }
}

/**
 * ¿Sigue valiendo como ganadora una línea que se acaba de editar? Si dejó de ofrecer el ítem o de cotizar la cantidad
 * completa, el ítem pierde su ganador.
 */
export function sigueSiendoGanadora(linea: { cotiza: boolean; cantidad: number }, cantidadItem: number): boolean {
  return linea.cotiza && cantidadCompleta(linea.cantidad, cantidadItem);
}
