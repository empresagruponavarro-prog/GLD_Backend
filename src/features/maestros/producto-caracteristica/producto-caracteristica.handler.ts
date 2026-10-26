import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { CaracteristicaItemDto, ReplaceCaracteristicasDto } from './producto-caracteristica.dto.js';

/** Características estándar de un bien del catálogo; los activos fijos las heredan. */
@Injectable()
export class ProductoCaracteristicaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listar(idProducto: number): Promise<CaracteristicaItemDto[]> {
    await this.asegurarProducto(idProducto);
    const filas = await this.db.orm.public.producto_caracteristica
      .where({ id_producto: idProducto })
      .orderBy((c) => c.id.asc())
      .all();
    return filas.map((f) => ({ nombre: String(f.nombre), valor: String(f.valor) }));
  }

  async reemplazar(idProducto: number, dto: ReplaceCaracteristicasDto): Promise<CaracteristicaItemDto[]> {
    await this.asegurarProducto(idProducto);

    const nuevas = new Map<string, CaracteristicaItemDto>();
    for (const item of dto.caracteristicas) {
      const nombre = item.nombre.trim();
      const valor = item.valor.trim();
      if (!nombre || !valor) throw new BadRequestException('Cada característica necesita nombre y valor');
      const clave = nombre.toLowerCase();
      if (nuevas.has(clave)) throw new BadRequestException(`La característica "${nombre}" está repetida`);
      nuevas.set(clave, { nombre, valor });
    }

    const actuales = await this.db.orm.public.producto_caracteristica.where({ id_producto: idProducto }).all();
    const actualPorClave = new Map(actuales.map((f) => [String(f.nombre).toLowerCase(), f]));

    for (const [clave, fila] of actualPorClave) {
      if (!nuevas.has(clave)) await this.db.orm.public.producto_caracteristica.where({ id: fila.id }).delete();
    }
    for (const [clave, item] of nuevas) {
      const existente = actualPorClave.get(clave);
      if (!existente) {
        await this.db.orm.public.producto_caracteristica.create({
          id_producto: idProducto,
          nombre: toVarchar<60>(item.nombre),
          valor: toVarchar<150>(item.valor),
        });
      } else if (String(existente.nombre) !== item.nombre || String(existente.valor) !== item.valor) {
        await this.db.orm.public.producto_caracteristica
          .where({ id: existente.id })
          .update({ nombre: toVarchar<60>(item.nombre), valor: toVarchar<150>(item.valor) });
      }
    }
    return this.listar(idProducto);
  }

  private async asegurarProducto(idProducto: number): Promise<void> {
    const producto = await this.db.orm.public.producto.first({ id: idProducto });
    if (!producto) throw new NotFoundException(`Producto ${idProducto} no encontrado`);
  }
}
