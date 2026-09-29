import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ObraHandler } from './obra.handler.js';
import type {
  UpdateObraDatosGeneralesDto,
  UpdateAvanceSemanalDto,
  CreateObraResidenteDto,
} from './obra.dto.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra')
export class ObraController {
  constructor(private readonly handler: ObraHandler) {}

  @Get(':idCentroCosto/cockpit')
  @ApiOperation({ summary: 'Cargar el Cockpit completo de Datos de Obra (ficha técnica, KPIs, cronograma, residentes, planos)' })
  @ApiParam({ name: 'idCentroCosto', type: Number })
  getCockpit(@Param('idCentroCosto', ParseIntPipe) id: number) {
    return this.handler.getCockpit(id);
  }

  @Patch(':idCentroCosto/generales')
  @ApiOperation({ summary: 'Actualizar ficha técnica general de la obra (dirección, ubigeo, coordenadas, contacto)' })
  @ApiParam({ name: 'idCentroCosto', type: Number })
  updateGenerales(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Body() dto: UpdateObraDatosGeneralesDto,
  ) {
    return this.handler.updateGenerales(id, dto);
  }

  @Patch(':idCentroCosto/cronograma/:idSemana/avance')
  @ApiOperation({ summary: 'Actualizar avance real (%) de una semana — recalcula automáticamente la Curva S y KPIs globales' })
  @ApiParam({ name: 'idCentroCosto', type: Number })
  @ApiParam({ name: 'idSemana', type: Number })
  updateAvance(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idSemana', ParseIntPipe) idSemana: number,
    @Body() dto: UpdateAvanceSemanalDto,
  ) {
    return this.handler.updateAvanceSemanal(idCentroCosto, idSemana, dto);
  }

  @Post(':idCentroCosto/residentes')
  @ApiOperation({ summary: 'Asignar un nuevo residente/personal técnico a la obra' })
  @ApiParam({ name: 'idCentroCosto', type: Number })
  createResidente(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Body() dto: CreateObraResidenteDto,
  ) {
    return this.handler.createResidente(id, dto);
  }

  @Delete(':idCentroCosto/residentes/:idResidente')
  @ApiOperation({ summary: 'Desasignar un residente de la obra' })
  @ApiParam({ name: 'idCentroCosto', type: Number })
  @ApiParam({ name: 'idResidente', type: Number })
  deleteResidente(
    @Param('idResidente', ParseIntPipe) idResidente: number,
  ) {
    return this.handler.deleteResidente(idResidente);
  }
}
