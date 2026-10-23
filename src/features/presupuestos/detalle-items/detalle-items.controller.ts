import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { PartidaItemsResponseDto, SyncPartidaItemsDto } from '../plantillas-items/plantillas-items.dto.js';
import { PptoDetalleItemsHandler } from './detalle-items.handler.js';

@ApiTags('presupuestos / items de partida')
@Controller('presupuestos/categorias-asignadas')
@Modulo('presupuestos')
export class PptoDetalleItemsController {
  constructor(private readonly handler: PptoDetalleItemsHandler) {}

  @Get(':idCat/items')
  @ApiOperation({ summary: '\u00cdtems (productos/servicios) de una partida del presupuesto' })
  @ApiOkResponse({ type: PartidaItemsResponseDto })
  list(@Param('idCat', ParseIntPipe) idCat: number): Promise<PartidaItemsResponseDto> {
    return this.handler.list(idCat);
  }

  @Put(':idCat/items')
  @ApiOperation({ summary: 'Sincroniza el lote completo de \u00edtems de la partida y recalcula su costo directo' })
  @ApiOkResponse({ type: PartidaItemsResponseDto })
  sync(@Param('idCat', ParseIntPipe) idCat: number, @Body() dto: SyncPartidaItemsDto): Promise<PartidaItemsResponseDto> {
    return this.handler.sync(idCat, dto);
  }
}
