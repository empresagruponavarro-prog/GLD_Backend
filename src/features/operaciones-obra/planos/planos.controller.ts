import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PlanosHandler } from './planos.handler.js';
import { CreateObraPlanoDto, NuevaVersionPlanoDto, UpdateObraPlanoDto } from './planos.dto.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/planos')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class PlanosController {
  constructor(private readonly handler: PlanosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar planos vigentes de la obra' })
  list(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.list(idCentroCosto);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo plano (metadatos)' })
  create(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Body() dto: CreateObraPlanoDto) {
    return this.handler.create(idCentroCosto, dto);
  }

  @Patch(':idPlano')
  @ApiOperation({ summary: 'Editar metadatos de un plano' })
  @ApiParam({ name: 'idPlano', type: Number })
  update(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
    @Body() dto: UpdateObraPlanoDto,
  ) {
    return this.handler.update(idCentroCosto, idPlano, dto);
  }

  @Post(':idPlano/versiones')
  @ApiOperation({ summary: 'Emitir una nueva versión/revisión del plano (la anterior queda histórica)' })
  @ApiParam({ name: 'idPlano', type: Number })
  nuevaVersion(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
    @Body() dto: NuevaVersionPlanoDto,
  ) {
    return this.handler.nuevaVersion(idCentroCosto, idPlano, dto);
  }

  @Get(':idPlano/historial')
  @ApiOperation({ summary: 'Historial de revisiones del plano' })
  @ApiParam({ name: 'idPlano', type: Number })
  historial(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
  ) {
    return this.handler.historial(idCentroCosto, idPlano);
  }

  @Delete(':idPlano')
  @ApiOperation({ summary: 'Eliminar una versión de plano (restaura la anterior si era la vigente)' })
  @ApiParam({ name: 'idPlano', type: Number })
  remove(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
  ) {
    return this.handler.remove(idCentroCosto, idPlano);
  }
}
