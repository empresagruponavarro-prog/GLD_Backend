import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar } from '../../../platform/db/valores.js';
import {
  calcularTotalesItem,
  mapearItemsConCatalogo,
  redondear2,
  sumarTotales,
  validarReferenciasCatalogo,
} from '../plantillas-items/plantillas-items.handler.js';
import type { PartidaItemsResponseDto, SyncPartidaItemsDto } from '../plantillas-items/plantillas-items.dto.js';

/**
 * \u00cdtems (productos/servicios del cat\u00e1logo) de una partida del presupuesto real
 * (`ppto_DetalleFasesCate`). Es el equivalente de los \u00edtems de plantilla: el costo directo de la
 * partida es la suma de los costos totales de sus \u00edtems y el de la fase, la suma de sus partidas.
 *
 * En `PartidaItemsResponseDto`, `id_plantilla_categoria` lleva el id de la partida del presupuesto.
 */
@Injectable()
export class PptoDetalleItemsHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(idPartida: number): Promise<PartidaItemsResponseDto> {
    const partida = await this.db.orm.public.ppto_DetalleFasesCate.first({ id: idPartida });
    if (!partida) throw new NotFoundException(`Partida ${idPartida} del presupuesto no encontrada`);

    const items = await this.db.orm.public.ppto_DetalleItems
      .where((i: any) => i.id_detalle_categoria.eq(idPartida))
      .orderBy((i: any) => i.Orden.asc())
      .all();

    const resultado = await mapearItemsConCatalogo(this.db, items, 'id_detalle_categoria');
    return { id_plantilla_categoria: idPartida, items: resultado, ...sumarTotales(resultado) };
  }

  /**
   * Sincroniza el lote completo de \u00edtems de la partida en una transacci\u00f3n: actualiza los que traen
   * `id`, crea los nuevos y elimina los que ya no vienen. Recalcula totales en el servidor y deja
   * `CostoDirecto` de la partida (y de su fase) al d\u00eda.
   */
  async sync(idPartida: number, dto: SyncPartidaItemsDto): Promise<PartidaItemsResponseDto> {
    const partida = await this.db.orm.public.ppto_DetalleFasesCate.first({ id: idPartida });
    if (!partida) throw new NotFoundException(`Partida ${idPartida} del presupuesto no encontrada`);

    const entrada = dto.items ?? [];
    await validarReferenciasCatalogo(
      this.db,
      entrada.map((i) => i.id_producto),
      entrada.map((i) => i.id_unidad_medida),
    );

    await this.db.transaction(async (tx) => {
      const orm = tx.orm.public;
      const actuales = await orm.ppto_DetalleItems.where((i: any) => i.id_detalle_categoria.eq(idPartida)).all();
      const idsActuales = new Set(actuales.map((i: any) => i.id as number));
      const conservados = new Set<number>();
      let costo = 0;

      for (const [orden, it] of entrada.entries()) {
        const { CostoTotal, VentaTotal } = calcularTotalesItem(it.Cantidad, it.CostoUnitario, it.PrecioVenta);
        costo += CostoTotal;
        const datos = {
          id_producto: it.id_producto,
          id_unidad_medida: it.id_unidad_medida,
          Item: it.Item?.trim() ? toVarchar<20>(it.Item.trim()) : null,
          Cantidad: toDecimalString(redondear2(it.Cantidad)),
          CostoUnitario: toDecimalString(redondear2(it.CostoUnitario)),
          PrecioVenta: toDecimalString(redondear2(it.PrecioVenta)),
          CostoTotal: toDecimalString(CostoTotal),
          VentaTotal: toDecimalString(VentaTotal),
          Orden: orden,
        };

        if (it.id_categoria) {
          await orm.producto.where({ id: it.id_producto }).update({ id_categoria: it.id_categoria } as any);
        }

        if (it.id && idsActuales.has(it.id) && !conservados.has(it.id)) {
          await orm.ppto_DetalleItems.where({ id: it.id }).update(datos as any);
          conservados.add(it.id);
        } else {
          await orm.ppto_DetalleItems.create({
            id_detalle_categoria: idPartida,
            IdPresupuesto: partida.IdPresupuesto,
            ...datos,
          } as any);
        }
      }

      const aBorrar = [...idsActuales].filter((id) => !conservados.has(id));
      if (aBorrar.length) {
        await orm.ppto_DetalleItems.where((i: any) => i.id.in(aBorrar)).deleteAndCount();
      }

      await orm.ppto_DetalleFasesCate.where({ id: idPartida }).update({ CostoDirecto: toDecimalString(redondear2(costo)) });

      // El costo directo de la fase es la suma de sus partidas.
      if (partida.IdPresupuestoDetalle) {
        const cates = await orm.ppto_DetalleFasesCate
          .where((c: any) => c.IdPresupuestoDetalle.eq(toVarchar(partida.IdPresupuestoDetalle as string)))
          .all();
        const suma = cates.reduce((acc: number, c: any) => acc + (Number(c.CostoDirecto) || 0), 0);
        await orm.ppto_DetalleFases
          .where((f: any) => f.IdPresupuestoDetalle.eq(toVarchar(partida.IdPresupuestoDetalle as string)))
          .update({ CostoDirecto: toDecimalString(redondear2(suma)) });
      }
    });

    return this.list(idPartida);
  }
}
