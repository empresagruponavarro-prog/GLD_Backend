import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
}
