import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CronogramaHandler } from './cronograma.handler.js';
import { CreateLoteSemanasDto, CreateObraSemanaDto, UpdateAvanceSemanalDto, UpdateObraSemanaDto } from './cronograma.dto.js';
import { Modulo } from '../../../platform/auth/permisos.decorator.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/cronograma')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class CronogramaController {
  constructor(private readonly handler: CronogramaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar las semanas del cronograma de la obra' })
  list(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.list(idCentroCosto);
  }

  @Post('lote')
  @ApiOperation({ summary: 'Crear múltiples semanas en lote para la obra' })
  createLote(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Body() dto: CreateLoteSemanasDto,
  ) {
    return this.handler.createLote(idCentroCosto, dto);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una semana del cronograma (numeración automática si no se envía)' })
  create(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Body() dto: CreateObraSemanaDto) {
    return this.handler.create(idCentroCosto, dto);
  }

  @Patch(':idSemana')
  @ApiOperation({ summary: 'Editar una semana del cronograma' })
  @ApiParam({ name: 'idSemana', type: Number })
  update(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idSemana', ParseIntPipe) idSemana: number,
    @Body() dto: UpdateObraSemanaDto,
  ) {
    return this.handler.update(idCentroCosto, idSemana, dto);
  }

  @Patch(':idSemana/avance')
  @ApiOperation({ summary: 'Actualizar avance real (%) y estado de una semana' })
  @ApiParam({ name: 'idSemana', type: Number })
  updateAvance(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idSemana', ParseIntPipe) idSemana: number,
    @Body() dto: UpdateAvanceSemanalDto,
  ) {
    return this.handler.updateAvance(idCentroCosto, idSemana, dto);
  }

  @Delete(':idSemana')
  @ApiOperation({ summary: 'Eliminar una semana del cronograma' })
  @ApiParam({ name: 'idSemana', type: Number })
  remove(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idSemana', ParseIntPipe) idSemana: number,
  ) {
    return this.handler.remove(idCentroCosto, idSemana);
  }
}
