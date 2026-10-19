import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LecturaCompartida, Modulo } from '../../../platform/auth/permisos.decorator.js';
import { PartidaItemsResponseDto, SyncPartidaItemsDto } from './plantillas-items.dto.js';
import { PlantillasItemsHandler } from './plantillas-items.handler.js';

@ApiTags('Presupuestos - Plantillas')
@Controller('presupuestos/plantillas/categorias')
@Modulo('presupuestos.plantillas')
export class PlantillasItemsController {
  constructor(private readonly handler: PlantillasItemsHandler) {}

  @LecturaCompartida()
  @Get(':idCat/items')
  @ApiOperation({ summary: 'Ítems (productos/servicios) de una partida de plantilla' })
  @ApiOkResponse({ type: PartidaItemsResponseDto })
  list(@Param('idCat', ParseIntPipe) idCat: number): Promise<PartidaItemsResponseDto> {
    return this.handler.list(idCat);
  }

  @Put(':idCat/items')
  @ApiOperation({ summary: 'Sincroniza el lote completo de ítems de la partida y recalcula su costo referencial' })
  @ApiOkResponse({ type: PartidaItemsResponseDto })
  sync(@Param('idCat', ParseIntPipe) idCat: number, @Body() dto: SyncPartidaItemsDto): Promise<PartidaItemsResponseDto> {
    return this.handler.sync(idCat, dto);
  }
}
