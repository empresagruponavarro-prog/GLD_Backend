import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import {
  DevolverEquipoDto,
  EquipoAsignadoDto,
  EquipoInventarioDto,
  MovimientoEquipoDto,
  NuevaAsignacionDto,
  OpcionesEquipoDto,
  ReasignarEquipoDto,
} from './activo-fijo.dto.js';
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

  @Get('equipos/inventario')
  @ApiOperation({ summary: 'Inventario general de equipos tecnológicos (para el tablero)' })
  @ApiOkResponse({ type: EquipoInventarioDto, isArray: true })
  inventario(): Promise<EquipoInventarioDto[]> {
    return this.handler.inventario();
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
    @Body() dto: DevolverEquipoDto,
  ): Promise<EquipoAsignadoDto> {
    return this.handler.devolver(id, equipoId, dto);
  }

  @Get(':id/equipos/entrega')
  @ApiOperation({ summary: 'Hoja «Entrega de equipos» (.docx) con nombre, DNI, fecha y equipos del trabajador' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo (Trabajador) que recibe' })
  @ApiQuery({ name: 'ids', required: false, description: 'IDs de equipos separados por coma (por defecto, todos)' })
  @ApiQuery({ name: 'fecha', required: false, description: 'yyyy-MM-dd (por defecto, la de asignación)' })
  async entrega(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
    @Query('ids') ids?: string,
    @Query('fecha') fecha?: string,
  ): Promise<StreamableFile> {
    const lista = (ids ?? '')
      .split(',')
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n > 0);
    const fechaValida = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined;
    const { archivo, nombre } = await this.handler.entrega(id, lista, fechaValida);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    });
    return new StreamableFile(archivo);
  }

  @Get('equipos/:equipoId/historial')
  @ApiOperation({ summary: 'Historial de movimientos (asignación, reasignación, devolución) de un equipo' })
  @ApiParam({ name: 'equipoId', type: Number, description: 'ID del activo fijo' })
  @ApiOkResponse({ type: MovimientoEquipoDto, isArray: true })
  historial(@Param('equipoId', ParseIntPipe) equipoId: number): Promise<MovimientoEquipoDto[]> {
    return this.handler.historial(equipoId);
  }
}
