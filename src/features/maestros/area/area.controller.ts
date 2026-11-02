import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AreaResponseDto, CreateAreaDto, UpdateAreaDto } from './area.dto.js';
import { AreaHandler } from './area.handler.js';
import { LecturaCompartida, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('maestros/area')
@Controller('maestros/area')
@Modulo('maestros.areas')
export class AreaController {
  constructor(private readonly handler: AreaHandler) {}

  @LecturaCompartida()
  @Get()
  @ApiOperation({ summary: 'Listar areas de la empresa' })
  @ApiQuery({ name: 'activas', required: false, type: Boolean })
  @ApiOkResponse({ type: AreaResponseDto, isArray: true })
  list(@Query('activas') activas?: string): Promise<AreaResponseDto[]> {
    return this.handler.list(activas === 'true');
  }

  @Post()
  @ApiOperation({ summary: 'Crear area' })
  @ApiCreatedResponse({ type: AreaResponseDto })
  @ApiConflictResponse({ description: 'Codigo duplicado' })
  create(@Body() dto: CreateAreaDto): Promise<AreaResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar nombre / estado (el codigo no se edita)' })
  @ApiOkResponse({ type: AreaResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAreaDto): Promise<AreaResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar area (solo si no esta en uso)' })
  @ApiNoContentResponse({ description: 'Area eliminada' })
  @ApiNotFoundResponse({ description: 'No existe' })
  @ApiConflictResponse({ description: 'El area esta en uso' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}
