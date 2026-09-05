import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../../platform/db/pagination.js';
import {
  type ProductoRow,
  ListProductoQueryDto,
} from '../../producto/producto.dto.js';
import { CategoriaProductosHandler } from './productos.handler.js';

@ApiTags('maestros/categoria')
@Controller('maestros/categoria/:id/productos')
export class CategoriaProductosController {
  constructor(private readonly handler: CategoriaProductosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos de una categoría' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListProductoQueryDto,
  ): Promise<Paginated<ProductoRow>> {
    return this.handler.list(id, query);
  }
}