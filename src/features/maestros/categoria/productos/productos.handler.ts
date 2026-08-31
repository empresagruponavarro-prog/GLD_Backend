import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Paginated } from '../../../../platform/db/pagination.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import {
  type ProductoRow,
  ListProductoQueryDto,
} from '../../producto/producto.dto.js';
import { ProductoHandler } from '../../producto/producto.handler.js';

@Injectable()
export class CategoriaProductosHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly productos: ProductoHandler,
  ) {}

  async list(categoriaId: number, query: ListProductoQueryDto): Promise<Paginated<ProductoRow>> {
    const categoria = await this.db.orm.public.categoria.first({ id: categoriaId });
    if (!categoria) throw new NotFoundException(`Categoría ${categoriaId} no encontrada`);
    return this.productos.listByCategoria(categoriaId, query);
  }
}