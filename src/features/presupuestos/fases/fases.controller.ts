import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CreatePptoFaseDto,
  ListPptoFaseQueryDto,
  PptoFaseResponseDto,
  UpdatePptoFaseDto,
} from './fases.dto.js';
import { PptoFasesHandler } from './fases.handler.js';

@ApiTags('presupuestos / fases-maestras')
@Controller('presupuestos/fases-maestras')
export class PptoFasesController {
  constructor(private readonly handler: PptoFasesHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar catálogo de fases maestras de presupuestos' })
  @ApiOkResponse({ type: PptoFaseResponseDto, isArray: true })
  findAll(@Query() query: ListPptoFaseQueryDto) {
    return this.handler.list(query);
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Obtener fase maestra por ID o código IdpptoFase' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código de fase (ej. FASE-01)' })
  @ApiOkResponse({ type: PptoFaseResponseDto })
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.handler.getById(idOrCode);
  }

  @Get(':idpptoFase/categorias')
  @ApiOperation({ summary: 'Listar categorías maestras pertenecientes a una fase' })
  @ApiParam({ name: 'idpptoFase', description: 'Código IdpptoFase' })
  findCategorias(@Param('idpptoFase') idpptoFase: string) {
    return this.handler.getCategoriasDeFase(idpptoFase);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva fase maestra de presupuesto' })
  @ApiCreatedResponse({ type: PptoFaseResponseDto })
  create(@Body() dto: CreatePptoFaseDto) {
    return this.handler.create(dto);
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Actualizar fase maestra por ID o IdpptoFase' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdpptoFase' })
  @ApiOkResponse({ type: PptoFaseResponseDto })
  update(@Param('idOrCode') idOrCode: string, @Body() dto: UpdatePptoFaseDto) {
    return this.handler.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @ApiOperation({ summary: 'Eliminar fase maestra por ID o IdpptoFase' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdpptoFase' })
  remove(@Param('idOrCode') idOrCode: string) {
    return this.handler.remove(idOrCode);
  }
}
