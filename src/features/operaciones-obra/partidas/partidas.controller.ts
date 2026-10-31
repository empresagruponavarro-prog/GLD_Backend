import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { ImportarPresupuestoHandler } from './importar-presupuesto.handler.js';
import { PartidasHandler } from './partidas.handler.js';
import {
  CreatePartidaDto,
  CreateSubpartidaDto,
  ImportarPresupuestoDto,
  UpdateMetasDto,
  UpdatePartidaDto,
  UpdateSubpartidaDto,
} from './partidas.dto.js';

/** Estructura de la obra (partidas › subpartidas) y metas semanales. */
@ApiTags('Operaciones de Obra · Partidas')
@Controller('operaciones/obra/:idCentroCosto')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class PartidasController {
  constructor(
    private readonly handler: PartidasHandler,
    private readonly importador: ImportarPresupuestoHandler,
  ) {}

  @Get('partidas')
  @ApiOperation({ summary: 'Listar la estructura de la obra: partidas con sus subpartidas y metas manuales' })
  listar(@Param('idCentroCosto', ParseIntPipe) id: number) {
    return this.handler.listar(id);
  }

  @Get('presupuestos-disponibles')
  @ApiOperation({ summary: 'Versiones de presupuesto de la obra desde las que se puede importar la estructura' })
  presupuestosDisponibles(@Param('idCentroCosto', ParseIntPipe) id: number) {
    return this.importador.disponibles(id);
  }

  @Post('partidas/importar-presupuesto')
  @ApiOperation({ summary: 'Importar partidas y subpartidas desde un presupuesto (fase → partida, categoría → subpartida)' })
  importar(@Param('idCentroCosto', ParseIntPipe) id: number, @Body() dto: ImportarPresupuestoDto, @CurrentUser('id') usuario: string) {
    return this.importador.importar(id, dto, usuario);
  }

  @Post('partidas')
  @ApiOperation({ summary: 'Crear una partida' })
  crearPartida(@Param('idCentroCosto', ParseIntPipe) id: number, @Body() dto: CreatePartidaDto) {
    return this.handler.crearPartida(id, dto);
  }

  @Patch('partidas/:idPartida')
  @ApiOperation({ summary: 'Editar una partida' })
  @ApiParam({ name: 'idPartida', type: Number })
  editarPartida(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Param('idPartida', ParseIntPipe) idPartida: number,
    @Body() dto: UpdatePartidaDto,
  ) {
    return this.handler.editarPartida(id, idPartida, dto);
  }

  @Delete('partidas/:idPartida')
  @ApiOperation({ summary: 'Eliminar una partida (409 si alguna subpartida tiene avance registrado)' })
  @ApiParam({ name: 'idPartida', type: Number })
  eliminarPartida(@Param('idCentroCosto', ParseIntPipe) id: number, @Param('idPartida', ParseIntPipe) idPartida: number) {
    return this.handler.eliminarPartida(id, idPartida);
  }

  @Post('partidas/:idPartida/subpartidas')
  @ApiOperation({ summary: 'Crear una subpartida con sus fechas programadas' })
  @ApiParam({ name: 'idPartida', type: Number })
  crearSubpartida(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Param('idPartida', ParseIntPipe) idPartida: number,
    @Body() dto: CreateSubpartidaDto,
  ) {
    return this.handler.crearSubpartida(id, idPartida, dto);
  }

  @Patch('subpartidas/:idSubpartida')
  @ApiOperation({ summary: 'Editar una subpartida' })
  @ApiParam({ name: 'idSubpartida', type: Number })
  editarSubpartida(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Param('idSubpartida', ParseIntPipe) idSub: number,
    @Body() dto: UpdateSubpartidaDto,
  ) {
    return this.handler.editarSubpartida(id, idSub, dto);
  }

  @Delete('subpartidas/:idSubpartida')
  @ApiOperation({ summary: 'Eliminar una subpartida (409 si tiene avance registrado)' })
  @ApiParam({ name: 'idSubpartida', type: Number })
  eliminarSubpartida(@Param('idCentroCosto', ParseIntPipe) id: number, @Param('idSubpartida', ParseIntPipe) idSub: number) {
    return this.handler.eliminarSubpartida(id, idSub);
  }

  @Put('subpartidas/:idSubpartida/metas')
  @ApiOperation({ summary: 'Fijar las metas semanales (1-10) de una subpartida; null = reparto automático por días laborables' })
  @ApiParam({ name: 'idSubpartida', type: Number })
  guardarMetas(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Param('idSubpartida', ParseIntPipe) idSub: number,
    @Body() dto: UpdateMetasDto,
  ) {
    return this.handler.guardarMetas(id, idSub, dto);
  }
}
