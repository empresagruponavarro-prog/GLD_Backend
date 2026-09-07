import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CreatePptoHistorialDto,
  ListPptoHistorialQueryDto,
  PptoHistorialResponseDto,
  UpdatePptoHistorialDto,
} from './presupuesto-historial.dto.js';
import { PresupuestoHistorialHandler } from './presupuesto-historial.handler.js';

@ApiTags('presupuestos / historial-versiones')
@Controller('presupuestos/historial-versiones')
export class PresupuestoHistorialController {
  constructor(private readonly handler: PresupuestoHistorialHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar versiones de presupuestos' })
  @ApiOkResponse({ type: PptoHistorialResponseDto, isArray: true })
  findAll(@Query() query: ListPptoHistorialQueryDto) {
    return this.handler.list(query);
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Obtener historial por ID o IdPresupuestoVersion' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdPresupuestoVersion' })
  @ApiOkResponse({ type: PptoHistorialResponseDto })
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.handler.getById(idOrCode);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nueva versión de presupuesto en el historial' })
  @ApiCreatedResponse({ type: PptoHistorialResponseDto })
  create(@Body() dto: CreatePptoHistorialDto) {
    return this.handler.create(dto);
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Actualizar historial por ID o IdPresupuestoVersion' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdPresupuestoVersion' })
  @ApiOkResponse({ type: PptoHistorialResponseDto })
  update(@Param('idOrCode') idOrCode: string, @Body() dto: UpdatePptoHistorialDto) {
    return this.handler.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @ApiOperation({ summary: 'Eliminar historial por ID o IdPresupuestoVersion' })
  @ApiParam({ name: 'idOrCode', description: 'ID o IdPresupuestoVersion' })
  remove(@Param('idOrCode') idOrCode: string) {
    return this.handler.remove(idOrCode);
  }
}
