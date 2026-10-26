import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { LecturaCompartida, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CaracteristicaItemDto, ReplaceCaracteristicasDto } from './producto-caracteristica.dto.js';
import { ProductoCaracteristicaHandler } from './producto-caracteristica.handler.js';

@ApiTags('maestros/producto')
@Controller('maestros/producto')
@Modulo('maestros.productos')
export class ProductoCaracteristicaController {
  constructor(private readonly handler: ProductoCaracteristicaHandler) {}

  @LecturaCompartida()
  @Get(':id/caracteristicas')
  @ApiOperation({ summary: 'Características estándar de un bien del catálogo' })
  @ApiParam({ name: 'id', description: 'ID numérico del producto', type: Number })
  @ApiOkResponse({ type: CaracteristicaItemDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  listar(@Param('id', ParseIntPipe) id: number): Promise<CaracteristicaItemDto[]> {
    return this.handler.listar(id);
  }

  @Put(':id/caracteristicas')
  @ApiOperation({ summary: 'Reemplazar las características de un bien del catálogo (máx. 30)' })
  @ApiParam({ name: 'id', description: 'ID numérico del producto', type: Number })
  @ApiOkResponse({ type: CaracteristicaItemDto, isArray: true })
  @ApiBadRequestResponse({ description: 'Nombres repetidos o vacíos' })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  reemplazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceCaracteristicasDto,
  ): Promise<CaracteristicaItemDto[]> {
    return this.handler.reemplazar(id, dto);
  }
}
