import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar } from '../../../platform/db/varchar-helpers.js';
import { AlmacenSql } from '../../almacen/shared/almacen-sql.js';
import { ESTADOS_EDITABLES, type EstadoPpto } from '../aprobacion/estados.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { ConciliarCompromisosService, type ResultadoConciliacion } from '../compromisos/conciliar-compromisos.service.js';
import { bloquearPresupuestoPorCodigo } from '../cotizaciones-ppto/contexto-ppto.js';
import type { ResultadoReprorrateo } from '../cotizaciones-ppto/reprorrateo.js';
import { ReprorrateoService } from '../cotizaciones-ppto/reprorrateo.service.js';
import { resumenCotizacionDeItems } from '../cotizaciones-ppto/resumen-items.js';
import { sumarImportes } from '../shared/costos-meta.js';
import { recalcularMeta } from '../shared/recalcular-meta.js';
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
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly conciliacion: ConciliarCompromisosService,
    private readonly reprorrateo: ReprorrateoService,
  ) {}

  async list(idPartida: number): Promise<PartidaItemsResponseDto> {
    const partida = await this.db.orm.public.ppto_DetalleFasesCate.first({ id: idPartida });
    if (!partida) throw new NotFoundException(`Partida ${idPartida} del presupuesto no encontrada`);

    const items = await this.db.orm.public.ppto_DetalleItems
      .where((i: any) => i.id_detalle_categoria.eq(idPartida))
      .orderBy((i: any) => i.Orden.asc())
      .all();

    const resultado = await mapearItemsConCatalogo(this.db, items, 'id_detalle_categoria');
    await this.agregarCotizaciones(resultado);
    return {
      id_plantilla_categoria: idPartida,
      items: resultado,
      ...sumarTotales(resultado),
      // Plan 11: total Meta de la partida (los ítems sin precio Meta propio ya traen su total Base).
      costoTotalMeta: sumarImportes(resultado.map((i) => i.CostoTotalMeta ?? 0)),
    };
  }

  /**
   * Sincroniza el lote completo de \u00edtems de la partida en una transacci\u00f3n: actualiza los que traen
   * `id`, crea los nuevos y elimina los que ya no vienen. Recalcula totales en el servidor y deja
   * `CostoDirecto` de la partida (y de su fase) al d\u00eda.
   *
   * Plan 09 (D-12): un presupuesto aprobado, entregado, liquidado o anulado no admite cambios de ítems (409): se hacen con una
   * nueva versión o un adicional. Los ítems que conservan su `id` conservan sus cotizaciones y su ganador (D-14); si cambia el
   * producto, la cotización era por otro y el ítem pierde su ganador.
   */
  async sync(idPartida: number, dto: SyncPartidaItemsDto, user?: AuthUser): Promise<PartidaItemsResponseDto> {
    const partida = await this.db.orm.public.ppto_DetalleFasesCate.first({ id: idPartida });
    if (!partida) throw new NotFoundException(`Partida ${idPartida} del presupuesto no encontrada`);

    const entrada = dto.items ?? [];
    await validarReferenciasCatalogo(
      this.db,
      entrada.map((i) => i.id_producto),
      entrada.map((i) => i.id_unidad_medida),
    );

    const { compromisos, reprorrateo } = await this.db.transaction(async (tx): Promise<{ compromisos?: ResultadoConciliacion; reprorrateo?: ResultadoReprorrateo }> => {
      const orm = tx.orm.public;
      const ppto = partida.IdPresupuesto ? await bloquearPresupuestoPorCodigo(this.sql, tx, String(partida.IdPresupuesto)) : null;
      if (ppto && !ESTADOS_EDITABLES.includes(ppto.estado as EstadoPpto)) {
        throw new ConflictException(
          `El presupuesto ${ppto.codigo} está ${ppto.estado}: no se pueden cambiar sus ítems. Haga el cambio con una nueva versión o con un presupuesto adicional`,
        );
      }
      const actuales = await orm.ppto_DetalleItems.where((i: any) => i.id_detalle_categoria.eq(idPartida)).all();
      const productoPrevio = new Map(actuales.map((i: any) => [i.id as number, i.id_producto as number]));
      // Plan 11: precio Base y precio Meta propio de cada ítem antes de guardar, para saber si se movió algún precio Meta efectivo.
      const preciosPrevios = new Map(actuales.map((i: any) => [i.id as number, { base: Number(i.CostoUnitario) || 0, metaPropio: i.CostoUnitarioMeta != null }]));
      const idsActuales = new Set(actuales.map((i: any) => i.id as number));
      const conservados = new Set<number>();
      let costo = 0;
      let cambioPrecioMeta = false;

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
          const cambiaProducto = productoPrevio.get(it.id) !== it.id_producto;
          const previo = preciosPrevios.get(it.id);
          // Un ítem sin precio Meta propio vale su Base: si el Base cambió, su precio Meta efectivo se movió.
          if (previo && !previo.metaPropio && previo.base !== redondear2(it.CostoUnitario)) cambioPrecioMeta = true;
          await orm.ppto_DetalleItems.where({ id: it.id }).update((cambiaProducto ? { ...datos, ...SIN_GANADOR } : datos) as any);
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

      // Plan 11: el Meta sigue al Base (los ítems sin precio Meta propio copian su total Base) y se rearma en subfase, fase y presupuesto.
      if (partida.IdPresupuesto) {
        await recalcularMeta(this.sql, tx, String(partida.IdPresupuesto), {
          // Si se quitaron todos los ítems de una subfase que los tenía, su Meta (la suma de ellos) vuelve al Base.
          reiniciarSubfaseSinItems: actuales.length > 0 && entrada.length === 0 ? idPartida : undefined,
        });
      }

      if (!ppto) return {};
      // Plan 11 (D-5): si cambió el precio Meta efectivo de algún ítem (un ítem sin Meta propio cuyo precio Base cambió), los pesos del
      // reparto cambiaron y las cotizaciones de la subfase se vuelven a repartir (salvo las que ya tienen una orden registrada). Las
      // cantidades, los ítems nuevos o quitados y los cambios de producto siguen como antes del plan 11 (plan 09, D-14): la línea de la
      // cotización conserva su cantidad y el FUR toma la del ítem al precio unitario cotizado.
      const reprorrateo = cambioPrecioMeta ? await this.reprorrateo.reprorratearSubpartida(tx, ppto, idPartida, user) : undefined;
      // Los cambios de cantidad, producto o de ítems dejan al día el FUR y las órdenes provisionales ya generadas.
      return { ...(reprorrateo ? { reprorrateo } : {}), compromisos: await this.conciliacion.conciliar(tx, ppto, user) };
    });

    const respuesta = await this.list(idPartida);
    return { ...respuesta, ...(compromisos ? { compromisos } : {}), ...(reprorrateo ? { reprorrateo } : {}) };
  }

  /** Agrega a cada ítem sus cotizaciones, el proveedor ganador y el FUR/orden que ya nació de él. */
  private async agregarCotizaciones(items: PartidaItemsResponseDto['items']): Promise<void> {
    const resumen = await resumenCotizacionDeItems(
      this.sql,
      items.map((i) => i.id),
    );
    for (const item of items) {
      const r = resumen.get(item.id);
      if (r) item.cotizacion = { cotizaciones: r.cotizaciones, adjudicado: r.adjudicado, compromiso: r.compromiso, cubierto: r.cubierto };
    }
  }
}

/** Ganador y trazabilidad de la adjudicación en blanco. */
const SIN_GANADOR = {
  id_ppto_cot_detalle_ganadora: null,
  adjudicado_por: null,
  fecha_adjudicacion: null,
  comentario_adjudicacion: null,
};
