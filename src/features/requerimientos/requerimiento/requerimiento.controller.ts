import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { RequerimientoHandler } from './requerimiento.handler.js';
import {
  CreateRequerimientoDto,
  ListRequerimientoQueryDto,
  RequerimientoResponseDto,
  UpdateRequerimientoDto,
} from './requerimiento.dto.js';

@ApiTags('requerimientos')
@Controller('requerimientos')
export class RequerimientoController {
  constructor(private readonly handler: RequerimientoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar requerimientos FUR (paginado, con filtros y avance)' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListRequerimientoQueryDto): Promise<Paginated<RequerimientoResponseDto>> {
    return this.handler.list(query);
  }

  @Get('pendientes-oc')
  @ApiOperation({ summary: 'FUR aprobados con cantidad pendiente de ordenar (para generar una OC)' })
  @ApiOkResponse({ type: RequerimientoResponseDto, isArray: true })
  pendientesOc(): Promise<RequerimientoResponseDto[]> {
    return this.handler.pendientesOc();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un FUR con líneas, saldos, historial y OC vinculadas' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<RequerimientoResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un FUR en BORRADOR' })
  @ApiCreatedResponse({ type: RequerimientoResponseDto })
  @ApiBadRequestResponse({ description: 'Datos o referencias inválidas' })
  create(@Body() dto: CreateRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modificar un FUR (solo BORRADOR u OBSERVADO; reemplaza las líneas si se envían)' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'El FUR ya no es editable' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un FUR en BORRADOR que nunca se envió' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Eliminado' })
  @ApiConflictResponse({ description: 'No se puede eliminar (use anular)' })
  delete(@Param('id', ParseIntPipe) id: number): Promise<{ deleted: boolean; id: number }> {
    return this.handler.delete(id);
  }
}
