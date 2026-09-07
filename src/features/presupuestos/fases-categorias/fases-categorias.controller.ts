import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CreatePptoFaseCategoriaDto,
  ListPptoFaseCategoriaQueryDto,
  PptoFaseCategoriaResponseDto,
  UpdatePptoFaseCategoriaDto,
} from './fases-categorias.dto.js';
import { PptoFasesCategoriasHandler } from './fases-categorias.handler.js';

@ApiTags('presupuestos / categorias-fases-maestras')
@Controller('presupuestos/categorias-fases-maestras')
export class PptoFasesCategoriasController {
  constructor(private readonly handler: PptoFasesCategoriasHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías maestras de fases' })
  @ApiOkResponse({ type: PptoFaseCategoriaResponseDto, isArray: true })
  findAll(@Query() query: ListPptoFaseCategoriaQueryDto) {
    return this.handler.list(query);
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Obtener categoría maestra por ID o código IdpptoFaseCategoria' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código (ej. CAT-01)' })
  @ApiOkResponse({ type: PptoFaseCategoriaResponseDto })
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.handler.getById(idOrCode);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva categoría maestra de fase' })
  @ApiCreatedResponse({ type: PptoFaseCategoriaResponseDto })
  create(@Body() dto: CreatePptoFaseCategoriaDto) {
    return this.handler.create(dto);
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Actualizar categoría de fase por ID o IdpptoFaseCategoria' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdpptoFaseCategoria' })
  @ApiOkResponse({ type: PptoFaseCategoriaResponseDto })
  update(@Param('idOrCode') idOrCode: string, @Body() dto: UpdatePptoFaseCategoriaDto) {
    return this.handler.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @ApiOperation({ summary: 'Eliminar categoría de fase por ID o IdpptoFaseCategoria' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdpptoFaseCategoria' })
  remove(@Param('idOrCode') idOrCode: string) {
    return this.handler.remove(idOrCode);
  }
}
