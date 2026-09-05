import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CatalogosFiltrosResponseDto,
  CentroCostoMetricasResponseDto,
  CentroCostoResumenResponseDto,
  CentroCostoResponseDto,
  ListCentroCostoQueryDto,
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
}