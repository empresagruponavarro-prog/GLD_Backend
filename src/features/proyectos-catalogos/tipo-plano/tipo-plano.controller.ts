import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CreateTipoPlanoDto, TipoPlanoDto, UpdateTipoPlanoDto } from './tipo-plano.dto.js';
import { TipoPlanoHandler } from './tipo-plano.handler.js';

@ApiTags('proyectos / catálogos / tipos de plano')
@Controller('proyectos/catalogos/tipos-plano')
@Modulo('proyectos.catalogos')
export class TipoPlanoController {
  constructor(private readonly handler: TipoPlanoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Tipos de plano' })
  @ApiQuery({ name: 'activos', required: false, type: Boolean })
  @ApiOkResponse({ type: TipoPlanoDto, isArray: true })
  list(@Query('activos') activos?: string) {
    return this.handler.list(activos === 'true');
  }

  @Post()
  @ApiOperation({ summary: 'Crear un tipo de plano' })
  @ApiCreatedResponse({ type: TipoPlanoDto })
  create(@Body() dto: CreateTipoPlanoDto) {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un tipo de plano (el código no cambia)' })
  @ApiOkResponse({ type: TipoPlanoDto })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTipoPlanoDto) {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un tipo de plano que nadie usa' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.handler.remove(id);
  }
}
