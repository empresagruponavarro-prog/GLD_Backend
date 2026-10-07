import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { AlmacenHandler } from './almacen.handler.js';
import {
  AlmacenResponseDto,
  AlmacenSelectQueryDto,
  AlmacenSelectResponseDto,
  CreateAlmacenDto,
  ListAlmacenQueryDto,
  UpdateAlmacenDto,
} from './almacen.dto.js';

@ApiTags('almacen/almacenes')
@Controller('almacen/almacenes')
export class AlmacenController {
  constructor(private readonly handler: AlmacenHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar almacenes' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListAlmacenQueryDto): Promise<Paginated<AlmacenResponseDto>> {
    return this.handler.list(query);
  }

  @Get('select')
  @ApiOperation({ summary: 'Almacenes para selector (id y nombre)' })
  @ApiOkResponse({ type: AlmacenSelectResponseDto, isArray: true })
  select(@Query() query: AlmacenSelectQueryDto): Promise<AlmacenSelectResponseDto[]> {
    return this.handler.select(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener almacén' })
  @ApiOkResponse({ type: AlmacenResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<AlmacenResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear almacén' })
  @ApiCreatedResponse({ type: AlmacenResponseDto })
  @ApiConflictResponse({ description: 'Código duplicado' })
  create(@Body() dto: CreateAlmacenDto): Promise<AlmacenResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar almacén' })
  @ApiOkResponse({ type: AlmacenResponseDto })
  @ApiBadRequestResponse({ description: 'No se puede desactivar con stock' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAlmacenDto): Promise<AlmacenResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar almacén (soft delete)' })
  @ApiNoContentResponse()
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}
