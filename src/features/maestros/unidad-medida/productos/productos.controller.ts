import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../../platform/db/pagination.js';
import {
  ListProductoQueryDto,
  ProductoResponseDto,
} from '../../producto/producto.dto.js';
import { UnidadMedidaProductosHandler } from './productos.handler.js';

@ApiTags('maestros/unidad-medida')
@Controller('maestros/unidad-medida/:id/productos')
export class UnidadMedidaProductosController {
  constructor(private readonly handler: UnidadMedidaProductosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos de una unidad de medida' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida' })
  @ApiOkResponse({
    description: 'Lista paginada de productos de la unidad de medida',
  })
  @ApiNotFoundResponse({ description: 'Unidad de medida no encontrada' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListProductoQueryDto,
  ): Promise<Paginated<ProductoResponseDto>> {
    return this.handler.list(id, query);
  }
}