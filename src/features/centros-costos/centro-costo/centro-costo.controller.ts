import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Paginated } from '../../../platform/db/pagination.js';
import {
  CatalogosFiltrosResponseDto,
  CentroCostoPrincipalResponseDto,
  CentroCostoMetricasResponseDto,
  CentroCostoResponseDto,
  CentroCostoResumenResponseDto,
  CentroCostoSelectResponseDto,
  CreateCentroCostoDto,
  ListCentroCostoQueryDto,
  UpdateCentroCostoDto,
} from './centro-costo.dto.js';
import { CentroCostoHandler } from './centro-costo.handler.js';

@ApiTags('centros-costos')
@Controller('centros-costos')
export class CentroCostoController {
  constructor(private readonly handler: CentroCostoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar centros de costos con filtros' })
  @ApiOkResponse({
    type: CentroCostoResponseDto,
    isArray: true,
    description: 'Lista de centros de costos filtrada',
  })
  findAll(@Query() query: ListCentroCostoQueryDto): Promise<Paginated<CentroCostoResponseDto>> {
    return this.handler.findAll(query);
  }

  @Get('metricas/estados')
  @ApiOperation({ summary: 'Conteo de estados de centros de costos' })
  @ApiOkResponse({
    type: CentroCostoMetricasResponseDto,
    description: 'Métricas de cantidad de centros de costos por estado',
  })
  getConteoEstados(): Promise<CentroCostoMetricasResponseDto> {
    return this.handler.getConteoEstados();
  }

  @Get('catalogos-filtros')
  @ApiOperation({ summary: 'Catálogos para los filtros' })
  @ApiOkResponse({
    type: CatalogosFiltrosResponseDto,
    description: 'Listas de opciones para los filtros de centros de costos',
  })
  getCatalogosFiltros(): Promise<CatalogosFiltrosResponseDto> {
    return this.handler.getCatalogosFiltros();
  }

  @Get('principales')
  @ApiOperation({ summary: 'Listar centros de costos principales' })
  @ApiOkResponse({
    type: CentroCostoPrincipalResponseDto,
    isArray: true,
    description: 'Lista de centros de costos principales',
  })
  getCentrosCostoPrincipal(): Promise<CentroCostoPrincipalResponseDto[]> {
    return this.handler.getCentrosCostoPrincipal();
  }

  @Get('select')
  @ApiOperation({ summary: 'Listar centros de costos para selector (id y nombre)' })
  @ApiOkResponse({
    type: CentroCostoSelectResponseDto,
    isArray: true,
    description: 'Listado mínimo (id y nombre) de centros de costos',
  })
  select(): Promise<CentroCostoSelectResponseDto[]> {
    return this.handler.select();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un centro de costo por ID' })
  @ApiParam({ name: 'id', description: 'ID numérico del centro de costo' })
  @ApiOkResponse({ type: CentroCostoResponseDto })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<CentroCostoResponseDto> {
    return this.handler.getById(id);
  }

  @Get(':id/presupuestos')
  @ApiOperation({ summary: 'Listar todos los presupuestos asignados a este Centro de Costos' })
  @ApiParam({ name: 'id', description: 'ID del centro de costo' })
  getPresupuestos(@Param('id', ParseIntPipe) id: number) {
    return this.handler.getPresupuestos(id);
  }

  @Get(':id/resumen-financiero')
  @ApiOperation({ summary: 'Resumen financiero de un centro de costos' })
  @ApiParam({ name: 'id', description: 'ID del centro de costo', example: 1 })
  @ApiOkResponse({
    type: CentroCostoResumenResponseDto,
    description: 'Resumen financiero con ejecución y saldos del centro de costos',
  })
  getResumenFinanciero(@Param('id', ParseIntPipe) id: number): Promise<CentroCostoResumenResponseDto> {
    return this.handler.getResumenFinanciero(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo centro de costos' })
  @ApiCreatedResponse({ type: CentroCostoResponseDto })
  create(@Body() dto: CreateCentroCostoDto): Promise<CentroCostoResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar centro de costos por ID' })
  @ApiParam({ name: 'id', description: 'ID numérico del centro de costo' })
  @ApiOkResponse({ type: CentroCostoResponseDto })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCentroCostoDto): Promise<CentroCostoResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar centro de costos por ID' })
  @ApiParam({ name: 'id', description: 'ID numérico del centro de costo' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.handler.remove(id);
  }
}
