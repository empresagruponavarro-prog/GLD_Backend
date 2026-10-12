import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CotizacionResponseDto,
  CreateCotizacionDto,
  CuadroComparativoDto,
  UpdateCotizacionDto,
} from './cotizacion.dto.js';
import { CotizacionHandler } from './cotizacion.handler.js';

@ApiTags('requerimientos / cotizaciones')
@Controller('requerimientos/:id')
@ApiParam({ name: 'id', type: Number, description: 'ID del requerimiento' })
export class CotizacionController {
  constructor(private readonly handler: CotizacionHandler) {}

  @Get('cotizaciones')
  @ApiOperation({ summary: 'Cotizaciones del requerimiento, con totales sin/con IGV' })
  @ApiOkResponse({ type: CotizacionResponseDto, isArray: true })
  list(@Param('id', ParseIntPipe) id: number): Promise<CotizacionResponseDto[]> {
    return this.handler.list(id);
  }

  @Get('cuadro-comparativo')
  @ApiOperation({ summary: 'Cuadro comparativo linea x proveedor (no sugiere ganador)' })
  @ApiOkResponse({ type: CuadroComparativoDto })
  @ApiNotFoundResponse({ description: 'El requerimiento no existe' })
  cuadro(@Param('id', ParseIntPipe) id: number): Promise<CuadroComparativoDto> {
    return this.handler.cuadroComparativo(id);
  }

  @Get('cotizaciones/:idCot')
  @ApiOperation({ summary: 'Detalle de una cotizacion' })
  @ApiOkResponse({ type: CotizacionResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  get(@Param('id', ParseIntPipe) id: number, @Param('idCot', ParseIntPipe) idCot: number): Promise<CotizacionResponseDto> {
    return this.handler.getById(id, idCot);
  }

  @Post('cotizaciones')
  @ApiOperation({ summary: 'Registrar la cotizacion de un proveedor (FUR de compra en ENVIADO)' })
  @ApiCreatedResponse({ type: CotizacionResponseDto })
  @ApiBadRequestResponse({ description: 'Proveedor o lineas invalidas' })
  @ApiConflictResponse({ description: 'FUR fuera de ENVIADO, no es de compra o proveedor repetido' })
  create(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCotizacionDto): Promise<CotizacionResponseDto> {
    return this.handler.create(id, dto);
  }

  @Patch('cotizaciones/:idCot')
  @ApiOperation({ summary: 'Editar una cotizacion (reemplaza las lineas si se envian)' })
  @ApiOkResponse({ type: CotizacionResponseDto })
  @ApiConflictResponse({ description: 'FUR fuera de ENVIADO' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('idCot', ParseIntPipe) idCot: number,
    @Body() dto: UpdateCotizacionDto,
  ): Promise<CotizacionResponseDto> {
    return this.handler.update(id, idCot, dto);
  }

  @Delete('cotizaciones/:idCot')
  @ApiOperation({ summary: 'Eliminar una cotizacion' })
  @ApiOkResponse({ description: 'Eliminada' })
  @ApiConflictResponse({ description: 'FUR fuera de ENVIADO' })
  delete(@Param('id', ParseIntPipe) id: number, @Param('idCot', ParseIntPipe) idCot: number): Promise<{ deleted: boolean; id: number }> {
    return this.handler.delete(id, idCot);
  }
}
