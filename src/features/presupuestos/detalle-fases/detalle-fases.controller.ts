import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CreatePptoDetalleFaseDto,
  ListPptoDetalleFaseQueryDto,
  PptoDetalleFaseResponseDto,
  UpdatePptoDetalleFaseDto,
} from './detalle-fases.dto.js';
import { PptoDetalleFasesHandler } from './detalle-fases.handler.js';

@ApiTags('presupuestos / fases-asignadas')
@Controller('presupuestos/fases-asignadas')
export class PptoDetalleFasesController {
  constructor(private readonly handler: PptoDetalleFasesHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar fases asignadas a presupuestos' })
  @ApiOkResponse({ type: PptoDetalleFaseResponseDto, isArray: true })
  findAll(@Query() query: ListPptoDetalleFaseQueryDto) {
    return this.handler.list(query);
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Obtener fase asignada por ID o IdPresupuestoDetalle' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código (ej. DF-001)' })
  @ApiOkResponse({ type: PptoDetalleFaseResponseDto })
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.handler.getById(idOrCode);
  }

  @Get(':idPresupuestoDetalle/categorias')
  @ApiOperation({ summary: 'Listar desglose de categorías de una fase asignada' })
  @ApiParam({ name: 'idPresupuestoDetalle', description: 'Código IdPresupuestoDetalle' })
  findCategorias(@Param('idPresupuestoDetalle') idPresupuestoDetalle: string) {
    return this.handler.getCategorias(idPresupuestoDetalle);
  }

  @Post()
  @ApiOperation({ summary: 'Asignar fase a un presupuesto con su costo directo' })
  @ApiCreatedResponse({ type: PptoDetalleFaseResponseDto })
  create(@Body() dto: CreatePptoDetalleFaseDto) {
    return this.handler.create(dto);
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Actualizar fase asignada por ID o IdPresupuestoDetalle' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdPresupuestoDetalle' })
  @ApiOkResponse({ type: PptoDetalleFaseResponseDto })
  update(@Param('idOrCode') idOrCode: string, @Body() dto: UpdatePptoDetalleFaseDto) {
    return this.handler.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @ApiOperation({ summary: 'Eliminar fase asignada por ID o IdPresupuestoDetalle' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdPresupuestoDetalle' })
  remove(@Param('idOrCode') idOrCode: string) {
    return this.handler.remove(idOrCode);
  }
}
