import { Body, Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ObraHandler } from './obra.handler.js';
import { ObraCockpitDto, ObraDatosGeneralesDto, UpdateObraDatosGeneralesDto } from './obra.dto.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra')
export class ObraController {
  constructor(private readonly handler: ObraHandler) {}

  @Get(':idCentroCosto/cockpit')
  @ApiOperation({ summary: 'Cargar el Cockpit completo de Datos de Obra (cabecera, ficha, KPIs, cronograma, residentes, planos, documentos, incidencias)' })
  @ApiParam({ name: 'idCentroCosto', type: Number })
  @ApiOkResponse({ type: ObraCockpitDto })
  getCockpit(@Param('idCentroCosto', ParseIntPipe) id: number) {
    return this.handler.getCockpit(id);
  }

  @Patch(':idCentroCosto/generales')
  @ApiOperation({ summary: 'Crear/actualizar ficha técnica general de la obra (dirección, ubigeo, coordenadas, contacto)' })
  @ApiParam({ name: 'idCentroCosto', type: Number })
  @ApiOkResponse({ type: ObraDatosGeneralesDto })
  updateGenerales(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Body() dto: UpdateObraDatosGeneralesDto,
  ) {
    return this.handler.updateGenerales(id, dto);
  }
}
