import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CatalogosFiltrosResponseDto,
  CentroCostoMetricasResponseDto,
  CentroCostoResponseDto,
  CentroCostoResumenResponseDto,
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
  findAll(@Query() query: ListCentroCostoQueryDto): Promise<CentroCostoResponseDto[]> {
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

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Obtener un centro de costo por ID o CodCentroCto' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código (ej. CC-2026-001)' })
  @ApiOkResponse({ type: CentroCostoResponseDto })
  findOne(@Param('idOrCode') idOrCode: string): Promise<CentroCostoResponseDto> {
    return this.handler.getById(idOrCode);
  }

  @Get(':idOrCode/presupuestos')
  @ApiOperation({ summary: 'Listar todos los presupuestos asignados a este Centro de Costos' })
  @ApiParam({ name: 'idOrCode', description: 'Código CodCentroCto' })
  getPresupuestos(@Param('idOrCode') idOrCode: string) {
    return this.handler.getPresupuestos(idOrCode);
  }

  @Get(':id/resumen-financiero')
  @ApiOperation({ summary: 'Resumen financiero de un centro de costos' })
  @ApiParam({ name: 'id', description: 'Código único del centro de costo', example: 'CC-2026-001' })
  @ApiOkResponse({
    type: CentroCostoResumenResponseDto,
    description: 'Resumen financiero con ejecución y saldos del centro de costos',
  })
  getResumenFinanciero(@Param('id') id: string): Promise<CentroCostoResumenResponseDto> {
    return this.handler.getResumenFinanciero(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo centro de costos' })
  @ApiCreatedResponse({ type: CentroCostoResponseDto })
  create(@Body() dto: CreateCentroCostoDto): Promise<CentroCostoResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Actualizar centro de costos por ID o CodCentroCto' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o CodCentroCto (ej. CC-2026-001)' })
  @ApiOkResponse({ type: CentroCostoResponseDto })
  update(@Param('idOrCode') idOrCode: string, @Body() dto: UpdateCentroCostoDto): Promise<CentroCostoResponseDto> {
    return this.handler.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @ApiOperation({ summary: 'Eliminar centro de costos por ID o CodCentroCto' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o CodCentroCto' })
  remove(@Param('idOrCode') idOrCode: string) {
    return this.handler.remove(idOrCode);
  }
}
