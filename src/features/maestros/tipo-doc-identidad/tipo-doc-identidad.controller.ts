import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import {
  CreateTipoDocIdentidadDto,
  ListTipoDocIdentidadQueryDto,
  TipoDocIdentidadResponseDto,
  TipoDocIdentidadSelectQueryDto,
  TipoDocIdentidadSelectResponseDto,
  UpdateTipoDocIdentidadDto,
} from './tipo-doc-identidad.dto.js';
import { TipoDocIdentidadHandler } from './tipo-doc-identidad.handler.js';

@ApiTags('maestros/tipo-doc-identidad')
@Controller('maestros/tipo-doc-identidad')
export class TipoDocIdentidadController {
  constructor(private readonly handler: TipoDocIdentidadHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar tipos de documento de identidad' })
  @ApiOkResponse({
    description: 'Lista paginada de tipos de documento de identidad',
  })
  list(
    @Query() query: ListTipoDocIdentidadQueryDto,
  ): Promise<Paginated<TipoDocIdentidadResponseDto>> {
    return this.handler.list(query);
  }

  @Get('select')
  @ApiOperation({ summary: 'Listar tipos de documento para selector (id y nombre), filtrable por tipoAnexo' })
  @ApiOkResponse({
    type: TipoDocIdentidadSelectResponseDto,
    isArray: true,
    description: 'Listado mínimo (id y nombre) de tipos de documento de identidad',
  })
  select(
    @Query() query: TipoDocIdentidadSelectQueryDto,
  ): Promise<TipoDocIdentidadSelectResponseDto[]> {
    return this.handler.select(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un tipo de documento de identidad por id' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del tipo de documento de identidad' })
  @ApiOkResponse({ type: TipoDocIdentidadResponseDto })
  @ApiNotFoundResponse({ description: 'Tipo de documento de identidad no encontrado' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<TipoDocIdentidadResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un tipo de documento de identidad' })
  @ApiCreatedResponse({ type: TipoDocIdentidadResponseDto })
  create(@Body() dto: CreateTipoDocIdentidadDto): Promise<TipoDocIdentidadResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un tipo de documento de identidad' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del tipo de documento de identidad' })
  @ApiOkResponse({ type: TipoDocIdentidadResponseDto })
  @ApiNotFoundResponse({ description: 'Tipo de documento de identidad no encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoDocIdentidadDto,
  ): Promise<TipoDocIdentidadResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un tipo de documento de identidad' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del tipo de documento de identidad' })
  @ApiNoContentResponse({ description: 'Tipo de documento de identidad eliminado' })
  @ApiNotFoundResponse({ description: 'Tipo de documento de identidad no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}