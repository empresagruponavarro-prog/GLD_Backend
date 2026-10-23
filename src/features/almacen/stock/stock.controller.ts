import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { StockHandler } from './stock.handler.js';
import { ListStockQueryDto, MarcarOperativoDto, StockResponseDto } from './stock.dto.js';
import { Modulo, TambienDesde } from '../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('almacen/stock')
@Controller('almacen/stock')
@Modulo('almacen.stock')
export class StockController {
  constructor(private readonly handler: StockHandler) {}

  @TambienDesde(
    'almacen.ingresos',
    'almacen.salidas',
    'almacen.transferencias',
    'almacen.inventario-inicial',
    'almacen.prestamos',
    'almacen.kardex',
  )
  @Get()
  @ApiOperation({ summary: 'Stock actual por producto (total, prestado, disponible, compra sugerida, alerta)' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListStockQueryDto): Promise<Paginated<StockResponseDto>> {
    return this.handler.list(query);
  }

  @Get('compra-sugerida')
  @ApiOperation({ summary: 'Productos a reponer: disponible <= mínimo y no son equipos retornables' })
  @ApiOkResponse({ description: 'Lista paginada' })
  compraSugerida(@Query() query: ListStockQueryDto): Promise<Paginated<StockResponseDto>> {
    return this.handler.compraSugerida(query);
  }

  @TambienDesde('almacen.consulta')
  @Patch(':idProducto/:idAlmacen/operativo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar unidades no operativas como operativas (vuelven a disponibles)' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'No hay esa cantidad de unidades no operativas' })
  marcarOperativo(
    @Param('idProducto', ParseIntPipe) idProducto: number,
    @Param('idAlmacen', ParseIntPipe) idAlmacen: number,
    @Body() dto: MarcarOperativoDto,
  ): Promise<void> {
    return this.handler.marcarOperativo(idProducto, idAlmacen, dto);
  }
}
