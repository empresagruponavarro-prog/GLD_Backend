import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CreateReprogramacionDto, UpdateReprogramacionDto } from './reprogramaciones.dto.js';
import { ReprogramacionesHandler } from './reprogramaciones.handler.js';

/**
 * Pausas de plazo aprobadas. No cambian las fechas de las subpartidas: la línea base se conserva.
 * Causa externa = no es atraso (corre el plan); INTERNO = sí es atraso.
 */
@ApiTags('Operaciones de Obra · Reprogramaciones')
@Controller('operaciones/obra/:idCentroCosto/reprogramaciones')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class ReprogramacionesController {
  constructor(private readonly handler: ReprogramacionesHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar las reprogramaciones de la obra' })
  listar(@Param('idCentroCosto', ParseIntPipe) id: number) {
    return this.handler.listar(id);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una reprogramación (desde, días 1-60, motivo, detalle)' })
  crear(@Param('idCentroCosto', ParseIntPipe) id: number, @Body() dto: CreateReprogramacionDto, @CurrentUser('id') usuario: string) {
    return this.handler.crear(id, dto, usuario);
  }

  @Patch(':idReprogramacion')
  @ApiOperation({ summary: 'Corregir una reprogramación' })
  @ApiParam({ name: 'idReprogramacion', type: Number })
  editar(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Param('idReprogramacion', ParseIntPipe) idRep: number,
    @Body() dto: UpdateReprogramacionDto,
    @CurrentUser('id') usuario: string,
  ) {
    return this.handler.editar(id, idRep, dto, usuario);
  }

  @Delete(':idReprogramacion')
  @ApiOperation({ summary: 'Eliminar una reprogramación' })
  @ApiParam({ name: 'idReprogramacion', type: Number })
  eliminar(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Param('idReprogramacion', ParseIntPipe) idRep: number,
    @CurrentUser('id') usuario: string,
  ) {
    return this.handler.eliminar(id, idRep, usuario);
  }
}
