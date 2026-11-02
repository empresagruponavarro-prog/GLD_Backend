import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { type Paginated } from '../../../platform/db/pagination.js';
import {
  CreateTrabajadorDto,
  ListTrabajadorQueryDto,
  OpcionesTrabajadorDto,
  ResumenTrabajadoresDto,
  TrabajadorResponseDto,
  UpdateTrabajadorDto,
} from './trabajador.dto.js';
import { TrabajadorHandler } from './trabajador.handler.js';

/**
 * RR.HH. › Trabajadores. Reemplaza a «Personas» de Inv. Tecnología. No hay DELETE: a un trabajador se le
 * da de baja con `estado: false`. La lista para selectores sigue en `GET /maestros/anexo/select`.
 */
@ApiTags('rrhh/trabajadores')
@Controller('rrhh/trabajadores')
@Modulo('rrhh.trabajadores')
export class TrabajadorController {
  constructor(private readonly handler: TrabajadorHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar trabajadores (paginado, búsqueda por nombre o documento)' })
  @ApiOkResponse({ description: 'Lista paginada de trabajadores' })
  list(@Query() query: ListTrabajadorQueryDto): Promise<Paginated<TrabajadorResponseDto>> {
    return this.handler.list(query);
  }

  @Get('resumen')
  @ApiOperation({ summary: 'Conteos para las tarjetas: total, activos, de baja, ficha pendiente y documento pendiente' })
  @ApiOkResponse({ type: ResumenTrabajadoresDto })
  resumen(): Promise<ResumenTrabajadoresDto> {
    return this.handler.resumen();
  }

  @Get('opciones')
  @ApiOperation({ summary: 'Opciones del formulario: tipos de documento, tipos de trabajador y modalidades de contrato' })
  @ApiOkResponse({ type: OpcionesTrabajadorDto })
  opciones(): Promise<OpcionesTrabajadorDto> {
    return this.handler.opciones();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un trabajador' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo (Trabajador)' })
  @ApiOkResponse({ type: TrabajadorResponseDto })
  @ApiNotFoundResponse({ description: 'No existe o no es un trabajador' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<TrabajadorResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un trabajador' })
  @ApiCreatedResponse({ type: TrabajadorResponseDto })
  create(@Body() dto: CreateTrabajadorDto): Promise<TrabajadorResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un trabajador (estado false = darlo de baja)' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del anexo (Trabajador)' })
  @ApiOkResponse({ type: TrabajadorResponseDto })
  @ApiNotFoundResponse({ description: 'No existe o no es un trabajador' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrabajadorDto): Promise<TrabajadorResponseDto> {
    return this.handler.update(id, dto);
  }
}
