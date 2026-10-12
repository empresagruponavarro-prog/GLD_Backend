import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ResidentesHandler } from './residentes.handler.js';
import { CreateObraResidenteDto, UpdateObraResidenteDto } from './residentes.dto.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/residentes')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class ResidentesController {
  constructor(private readonly handler: ResidentesHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar residentes / personal técnico de la obra' })
  list(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.list(idCentroCosto);
  }

  @Post()
  @ApiOperation({ summary: 'Asignar un residente / personal técnico a la obra' })
  create(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Body() dto: CreateObraResidenteDto) {
    return this.handler.create(idCentroCosto, dto);
  }

  @Patch(':idResidente')
  @ApiOperation({ summary: 'Editar datos de un residente' })
  @ApiParam({ name: 'idResidente', type: Number })
  update(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idResidente', ParseIntPipe) idResidente: number,
    @Body() dto: UpdateObraResidenteDto,
  ) {
    return this.handler.update(idCentroCosto, idResidente, dto);
  }

  @Delete(':idResidente')
  @ApiOperation({ summary: 'Desasignar un residente de la obra' })
  @ApiParam({ name: 'idResidente', type: Number })
  remove(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idResidente', ParseIntPipe) idResidente: number,
  ) {
    return this.handler.remove(idCentroCosto, idResidente);
  }
}
