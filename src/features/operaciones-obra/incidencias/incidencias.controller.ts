import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ObraIncidenciasHandler } from './incidencias.handler.js';
import { CreateObraIncidenciaDto, UpdateObraIncidenciaDto } from './incidencias.dto.js';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/incidencias')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class IncidenciasObraController {
  constructor(private readonly handler: ObraIncidenciasHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar incidencias / RFI de la obra' })
  list(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.list(idCentroCosto);
  }

  @Post()
  @ApiOperation({ summary: 'Reportar una incidencia / RFI (código correlativo automático)' })
  create(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Body() dto: CreateObraIncidenciaDto) {
    return this.handler.create(idCentroCosto, dto);
  }

  @Patch(':idIncidencia')
  @ApiOperation({ summary: 'Editar o cambiar el estado de una incidencia' })
  @ApiParam({ name: 'idIncidencia', type: Number })
  update(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idIncidencia', ParseIntPipe) idIncidencia: number,
    @Body() dto: UpdateObraIncidenciaDto,
  ) {
    return this.handler.update(idCentroCosto, idIncidencia, dto);
  }

  @Delete(':idIncidencia')
  @ApiOperation({ summary: 'Eliminar una incidencia' })
  @ApiParam({ name: 'idIncidencia', type: Number })
  remove(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idIncidencia', ParseIntPipe) idIncidencia: number,
  ) {
    return this.handler.remove(idCentroCosto, idIncidencia);
  }
}
