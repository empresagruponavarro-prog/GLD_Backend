import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { EquipoAsignadoDto, NuevaAsignacionDto, OpcionesEquipoDto, ReasignarEquipoDto } from './activo-fijo.dto.js';
import { ActivoFijoHandler } from './activo-fijo.handler.js';

@ApiTags('maestros/anexo')
@Controller('maestros/anexo')
@Modulo('maestros.anexos')
export class ActivoFijoController {
  constructor(private readonly handler: ActivoFijoHandler) {}

  @Get('equipos/opciones')
  @ApiOperation({ summary: 'Catálogo de activos fijos y árbol Local → Nivel → Ambiente para asignar equipos' })
  @ApiOkResponse({ type: OpcionesEquipoDto })
  opciones(): Promise<OpcionesEquipoDto> {
    return this.handler.opciones();
  }

  @Get(':id/equipos')
  @ApiOperation({ summary: 'Equipos tecnológicos asignados a un trabajador' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo (Trabajador)' })
  @ApiOkResponse({ type: EquipoAsignadoDto, isArray: true })
  listar(@Param('id', ParseIntPipe) id: number): Promise<EquipoAsignadoDto[]> {
    return this.handler.listar(id);
  }

  @Post(':id/equipos')
  @ApiOperation({ summary: 'Asignar un equipo (activo fijo) a un trabajador' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo (Trabajador)' })
  @ApiCreatedResponse({ type: EquipoAsignadoDto })
  asignar(@Param('id', ParseIntPipe) id: number, @Body() dto: NuevaAsignacionDto): Promise<EquipoAsignadoDto> {
    return this.handler.asignar(id, dto);
  }

  @Patch(':id/equipos/:equipoId/reasignar')
  @ApiOperation({ summary: 'Reasignar un equipo a otro trabajador' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo (Trabajador) que lo tiene hoy' })
  @ApiParam({ name: 'equipoId', type: Number, description: 'ID del activo fijo' })
  @ApiOkResponse({ type: EquipoAsignadoDto })
  reasignar(
    @Param('id', ParseIntPipe) id: number,
    @Param('equipoId', ParseIntPipe) equipoId: number,
    @Body() dto: ReasignarEquipoDto,
  ): Promise<EquipoAsignadoDto> {
    return this.handler.reasignar(id, equipoId, dto);
  }

  @Patch(':id/equipos/:equipoId/devolver')
  @ApiOperation({ summary: 'Devolver un equipo (queda sin responsable)' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo (Trabajador) que lo devuelve' })
  @ApiParam({ name: 'equipoId', type: Number, description: 'ID del activo fijo' })
  @ApiOkResponse({ type: EquipoAsignadoDto })
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @Param('equipoId', ParseIntPipe) equipoId: number,
  ): Promise<EquipoAsignadoDto> {
    return this.handler.devolver(id, equipoId);
  }
}
