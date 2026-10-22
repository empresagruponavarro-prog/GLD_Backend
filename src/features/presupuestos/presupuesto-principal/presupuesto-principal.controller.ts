import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CreatePresupuestoPrincipalDto,
  GenerarFursPresupuestoDto,
  GenerarFursPresupuestoResponseDto,
  ListPresupuestoPrincipalQueryDto,
  PresupuestoPrincipalResponseDto,
  PreviewFursPresupuestoResponseDto,
  UpdatePresupuestoPrincipalDto,
} from './presupuesto-principal.dto.js';
import { PresupuestoPrincipalHandler } from './presupuesto-principal.handler.js';
import { Modulo } from '../../../platform/auth/permisos.decorator.js';
import { CurrentUser } from '../../../platform/auth/current-user.decorator.js';
import type { AuthUser } from '../../../platform/auth/auth-user.js';

@ApiTags('presupuestos / principal')
@Controller('presupuestos')
@Modulo('presupuestos')
export class PresupuestoPrincipalController {
  constructor(private readonly handler: PresupuestoPrincipalHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar presupuestos principales con filtros y paginación' })
  @ApiOkResponse({ type: PresupuestoPrincipalResponseDto, isArray: true })
  findAll(@Query() query: ListPresupuestoPrincipalQueryDto) {
    return this.handler.list(query);
  }

  @Get(':idOrCode')
  @ApiOperation({ summary: 'Obtener presupuesto por ID numérico o código IdPresupuesto' })
  @ApiParam({ name: 'idOrCode', description: 'ID o Código IdPresupuesto (ej. PPTO-2026-001)' })
  @ApiOkResponse({ type: PresupuestoPrincipalResponseDto })
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.handler.getById(idOrCode);
  }

  @Get(':idOrCode/completo')
  @ApiOperation({ summary: 'Obtener presupuesto completo con su árbol de Fases, Categorías e Historial' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  findCompleto(@Param('idOrCode') idOrCode: string) {
    return this.handler.getCompleto(idOrCode);
  }

  @Get(':idOrCode/furs-preview')
  @ApiOperation({ summary: 'Vista previa de las fases e ítems listos para generar FURs' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  @ApiOkResponse({ type: PreviewFursPresupuestoResponseDto })
  previewFurs(@Param('idOrCode') idOrCode: string) {
    return this.handler.previewFursPorFase(idOrCode);
  }

  @Post(':idOrCode/generar-furs')
  @ApiOperation({ summary: 'Generar automáticamente FURs (Requerimientos) por cada Fase del presupuesto' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  @ApiCreatedResponse({ type: GenerarFursPresupuestoResponseDto })
  generarFurs(
    @Param('idOrCode') idOrCode: string,
    @Body() dto: GenerarFursPresupuestoDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.handler.generarFursPorFase(idOrCode, dto, user);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nuevo presupuesto principal vinculado a un Centro de Costos' })
  @ApiCreatedResponse({ type: PresupuestoPrincipalResponseDto })
  create(
    @Body() dto: CreatePresupuestoPrincipalDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.handler.create(dto, user?.usuario);
  }

  @Patch(':idOrCode')
  @ApiOperation({ summary: 'Actualizar presupuesto por ID o IdPresupuesto' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o IdPresupuesto (ej. PPTO-2026-001)' })
  @ApiOkResponse({ type: PresupuestoPrincipalResponseDto })
  update(@Param('idOrCode') idOrCode: string, @Body() dto: UpdatePresupuestoPrincipalDto) {
    return this.handler.update(idOrCode, dto);
  }

  @Delete(':idOrCode')
  @ApiOperation({ summary: 'Eliminar presupuesto por ID o IdPresupuesto y sus dependencias' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o IdPresupuesto' })
  remove(@Param('idOrCode') idOrCode: string) {
    return this.handler.remove(idOrCode);
  }
}
