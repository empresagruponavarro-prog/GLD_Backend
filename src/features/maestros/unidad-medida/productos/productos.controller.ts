import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../../platform/db/pagination.js';
import {
  type ProductoRow,
  ListProductoQueryDto,
} from '../../producto/producto.dto.js';
import { UnidadMedidaProductosHandler } from './productos.handler.js';

@ApiTags('maestros/unidad-medida')
@Controller('maestros/unidad-medida/:id/productos')
export class UnidadMedidaProductosController {
  constructor(private readonly handler: UnidadMedidaProductosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos de una unidad de medida' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListProductoQueryDto,
  ): Promise<Paginated<ProductoRow>> {
    return this.handler.list(id, query);
  }
}