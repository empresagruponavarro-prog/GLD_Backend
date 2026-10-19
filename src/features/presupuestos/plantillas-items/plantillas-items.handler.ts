import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toDecimalString, toVarchar } from '../presupuestos.helpers.js';
import type { PartidaItemResponseDto, PartidaItemsResponseDto, SyncPartidaItemsDto } from './plantillas-items.dto.js';

/** Redondeo comercial a 2 decimales (evita 1.005 → 1.00 por coma flotante). */
export function redondear2(valor: number): number {
  const n = Number(valor) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Totales de una línea: cantidad × unitario, cada uno redondeado a 2 decimales. */
export function calcularTotalesItem(cantidad: number, costoUnitario: number, precioVenta: number): { CostoTotal: number; VentaTotal: number } {
  const cant = redondear2(cantidad);
  return {
    CostoTotal: redondear2(cant * redondear2(costoUnitario)),
    VentaTotal: redondear2(cant * redondear2(precioVenta)),
  };
}

/** Suma los totales de varias líneas (resultado a 2 decimales). */
export function sumarTotales(items: ReadonlyArray<{ CostoTotal: number; VentaTotal: number }>): { costoTotal: number; ventaTotal: number } {
  let costo = 0;
  let venta = 0;
  for (const it of items) {
    costo += Number(it.CostoTotal) || 0;
    venta += Number(it.VentaTotal) || 0;
  }
  return { costoTotal: redondear2(costo), ventaTotal: redondear2(venta) };
}

/**
 * Ítems (productos/servicios del catálogo) de una partida de plantilla
 * (`ppto_Plantillas_Categorias`). El costo referencial de la partida es la suma
 * de los costos totales de sus ítems.
 */
@Injectable()
export class PlantillasItemsHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(idPartida: number): Promise<PartidaItemsResponseDto> {
    const partida = await this.db.orm.public.ppto_Plantillas_Categorias.first({ id: idPartida });
    if (!partida) throw new NotFoundException(`Partida ${idPartida} no encontrada`);

    const items = await this.db.orm.public.ppto_Plantillas_Items
      .where((i: any) => i.id_plantilla_categoria.eq(idPartida))
      .orderBy((i: any) => i.Orden.asc())
      .all();

    const idsProducto = [...new Set(items.map((i: any) => i.id_producto as number))];
    const idsUnidad = [...new Set(items.map((i: any) => i.id_unidad_medida as number))];

    const productos = idsProducto.length
      ? await this.db.orm.public.producto.where((p: any) => p.id.in(idsProducto)).all()
      : [];
    const unidades = idsUnidad.length
      ? await this.db.orm.public.unidad_medida.where((u: any) => u.id.in(idsUnidad)).all()
      : [];
    const idsCategoria = [...new Set(productos.map((p: any) => p.id_categoria as number))];
    const categorias = idsCategoria.length
      ? await this.db.orm.public.categoria.where((c: any) => c.id.in(idsCategoria)).all()
      : [];

    const prodPorId = new Map(productos.map((p: any) => [p.id as number, p]));
    const uniPorId = new Map(unidades.map((u: any) => [u.id as number, u]));
    const catPorId = new Map(categorias.map((c: any) => [c.id as number, c]));

    const resultado: PartidaItemResponseDto[] = items.map((i: any) => {
      const p: any = prodPorId.get(i.id_producto);
      const u: any = uniPorId.get(i.id_unidad_medida);
      const c: any = p ? catPorId.get(p.id_categoria) : undefined;
      return {
        id: i.id,
        id_plantilla_categoria: i.id_plantilla_categoria,
        Item: (i.Item as string | null) ?? undefined,
        Orden: i.Orden,
        id_producto: i.id_producto,
        producto: p
          ? {
              id: p.id,
              codigo: p.codigo as string,
              descripcion: p.descripcion as string,
              tipo_producto: p.tipo_producto,
              id_categoria: p.id_categoria,
              categoria: (c?.descripcion as string | null) ?? undefined,
            }
          : undefined,
        id_unidad_medida: i.id_unidad_medida,
        unidad: u
          ? {
              id: u.id,
              codigo: u.codigo as string,
              descripcion: u.descripcion as string,
              simbolo: (u.simbolo as string | null) ?? undefined,
            }
          : undefined,
        Cantidad: Number(i.Cantidad) || 0,
        CostoUnitario: Number(i.CostoUnitario) || 0,
        PrecioVenta: Number(i.PrecioVenta) || 0,
        CostoTotal: Number(i.CostoTotal) || 0,
        VentaTotal: Number(i.VentaTotal) || 0,
      };
    });

    return { id_plantilla_categoria: idPartida, items: resultado, ...sumarTotales(resultado) };
  }

  /**
   * Sincroniza el lote completo de ítems de la partida en una transacción:
   * actualiza los que traen `id`, crea los nuevos y elimina los que ya no vienen.
   * Recalcula los totales en el servidor y el `CostoReferencial` de la partida.
   */
  async sync(idPartida: number, dto: SyncPartidaItemsDto): Promise<PartidaItemsResponseDto> {
    const partida = await this.db.orm.public.ppto_Plantillas_Categorias.first({ id: idPartida });
    if (!partida) throw new NotFoundException(`Partida ${idPartida} no encontrada`);

    const entrada = dto.items ?? [];
    await this.validarReferencias(entrada.map((i) => i.id_producto), entrada.map((i) => i.id_unidad_medida));

    await this.db.transaction(async (tx) => {
      const orm = tx.orm.public;
      const actuales = await orm.ppto_Plantillas_Items
        .where((i: any) => i.id_plantilla_categoria.eq(idPartida))
        .all();
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

        if (it.id && idsActuales.has(it.id) && !conservados.has(it.id)) {
          await orm.ppto_Plantillas_Items.where({ id: it.id }).update(datos as any);
          conservados.add(it.id);
        } else {
          await orm.ppto_Plantillas_Items.create({ id_plantilla_categoria: idPartida, ...datos } as any);
        }
      }

      const aBorrar = [...idsActuales].filter((id) => !conservados.has(id));
      if (aBorrar.length) {
        await orm.ppto_Plantillas_Items.where((i: any) => i.id.in(aBorrar)).deleteAndCount();
      }

      await orm.ppto_Plantillas_Categorias
        .where({ id: idPartida })
        .update({ CostoReferencial: toDecimalString(redondear2(costo)) });
    });

    return this.list(idPartida);
  }

  /** Todos los productos y unidades referenciados deben existir en el catálogo. */
  private async validarReferencias(idsProducto: number[], idsUnidad: number[]): Promise<void> {
    const prods = [...new Set(idsProducto)];
    const unis = [...new Set(idsUnidad)];
    if (prods.length) {
      const encontrados = await this.db.orm.public.producto.where((p: any) => p.id.in(prods)).all();
      const ok = new Set(encontrados.map((p: any) => p.id as number));
      const faltan = prods.filter((id) => !ok.has(id));
      if (faltan.length) throw new BadRequestException(`Productos inexistentes en el catálogo: ${faltan.join(', ')}`);
    }
    if (unis.length) {
      const encontradas = await this.db.orm.public.unidad_medida.where((u: any) => u.id.in(unis)).all();
      const ok = new Set(encontradas.map((u: any) => u.id as number));
      const faltan = unis.filter((id) => !ok.has(id));
      if (faltan.length) throw new BadRequestException(`Unidades de medida inexistentes: ${faltan.join(', ')}`);
    }
  }
}
