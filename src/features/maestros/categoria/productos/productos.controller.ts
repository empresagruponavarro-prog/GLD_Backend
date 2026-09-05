import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../../platform/db/pagination.js';
import {
  ListProductoQueryDto,
  type ProductoRow,
} from '../../producto/producto.dto.js';
import { CategoriaProductosHandler } from './productos.handler.js';

@ApiTags('maestros/categoria')
@Controller('maestros/categoria/:id/productos')
export class CategoriaProductosController {
  constructor(private readonly handler: CategoriaProductosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos de una categoría' })
  @ApiParam({ name: 'id', description: 'ID numérico de la categoría', type: Number })
  @ApiOkResponse({
    description: 'Lista paginada de productos asociados a la categoría',
  })
  @ApiNotFoundResponse({ description: 'Categoría no encontrada' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListProductoQueryDto,
  ): Promise<Paginated<ProductoRow>> {
    return this.handler.list(id, query);
  }
}