import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CreatePptoDetalleFaseCateDto,
  ListPptoDetalleFaseCateQueryDto,
  PptoDetalleFaseCateResponseDto,
  UpdatePptoDetalleFaseCateDto,
} from './detalle-fases-cate.dto.js';
import { PptoDetalleFasesCateHandler } from './detalle-fases-cate.handler.js';

@ApiTags('presupuestos / categorias-asignadas')
@Controller('presupuestos/categorias-asignadas')
export class PptoDetalleFasesCateController {
  constructor(private readonly handler: PptoDetalleFasesCateHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías asignadas a fases de presupuestos' })
  @ApiOkResponse({ type: PptoDetalleFaseCateResponseDto, isArray: true })
  findAll(@Query() query: ListPptoDetalleFaseCateQueryDto) {
    return this.handler.list(query);
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Obtener categoría asignada por ID o IdPresupuestoDetalleCategoria' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código (ej. DFC-001)' })
  @ApiOkResponse({ type: PptoDetalleFaseCateResponseDto })
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.handler.getById(idOrCode);
  }

  @Post()
  @ApiOperation({ summary: 'Crear desglose de categoría para una fase de presupuesto' })
  @ApiCreatedResponse({ type: PptoDetalleFaseCateResponseDto })
  create(@Body() dto: CreatePptoDetalleFaseCateDto) {
    return this.handler.create(dto);
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Actualizar categoría asignada por ID o IdPresupuestoDetalleCategoria' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdPresupuestoDetalleCategoria' })
  @ApiOkResponse({ type: PptoDetalleFaseCateResponseDto })
  update(@Param('idOrCode') idOrCode: string, @Body() dto: UpdatePptoDetalleFaseCateDto) {
    return this.handler.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @ApiOperation({ summary: 'Eliminar categoría asignada por ID o IdPresupuestoDetalleCategoria' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdPresupuestoDetalleCategoria' })
  remove(@Param('idOrCode') idOrCode: string) {
    return this.handler.remove(idOrCode);
  }
}
