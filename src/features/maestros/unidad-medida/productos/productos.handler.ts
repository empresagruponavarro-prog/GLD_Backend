import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Paginated } from '../../../../platform/db/pagination.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import {
  ListProductoQueryDto,
  ProductoResponseDto,
} from '../../producto/producto.dto.js';
import { ProductoHandler } from '../../producto/producto.handler.js';

@Injectable()
export class UnidadMedidaProductosHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly productos: ProductoHandler,
  ) {}

  async list(
    unidadMedidaId: number,
    query: ListProductoQueryDto,
  ): Promise<Paginated<ProductoResponseDto>> {
    const unidad = await this.db.orm.public.unidad_medida.first({ id: unidadMedidaId });
    if (!unidad) throw new NotFoundException(`Unidad de medida ${unidadMedidaId} no encontrada`);
    return this.productos.listByUnidadMedida(unidadMedidaId, query);
  }
}