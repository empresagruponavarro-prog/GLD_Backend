import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Accion, LecturaCompartida, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CreateTipoProyectoDto, SetPlanosTipoProyectoDto, TipoProyectoDto, UpdateTipoProyectoDto } from './tipo-proyecto.dto.js';
import { TipoProyectoHandler } from './tipo-proyecto.handler.js';

@ApiTags('proyectos / catálogos / tipos de proyecto')
@Controller('proyectos/catalogos/tipos-proyecto')
@Modulo('proyectos.catalogos')
export class TipoProyectoController {
  constructor(private readonly handler: TipoProyectoHandler) {}

  @LecturaCompartida() // lo usa el formulario del centro de costo
  @Get()
  @ApiOperation({ summary: 'Tipos de proyecto con los planos que exige cada uno' })
  @ApiQuery({ name: 'activos', required: false, type: Boolean })
  @ApiOkResponse({ type: TipoProyectoDto, isArray: true })
  list(@Query('activos') activos?: string) {
    return this.handler.list(activos === 'true');
  }

  @Post()
  @ApiOperation({ summary: 'Crear un tipo de proyecto' })
  @ApiCreatedResponse({ type: TipoProyectoDto })
  create(@Body() dto: CreateTipoProyectoDto) {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombrar, ordenar o activar/desactivar un tipo de proyecto' })
  @ApiOkResponse({ type: TipoProyectoDto })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTipoProyectoDto) {
    return this.handler.update(id, dto);
  }

  @Put(':id/planos')
  @Accion('editar')
  @ApiOperation({ summary: 'Reemplaza la lista de planos (y cuáles son obligatorios) del tipo de proyecto' })
  @ApiOkResponse({ type: TipoProyectoDto })
  setPlanos(@Param('id', ParseIntPipe) id: number, @Body() dto: SetPlanosTipoProyectoDto) {
    return this.handler.setPlanos(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un tipo de proyecto que ningún centro de costo usa' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.handler.remove(id);
  }
}
