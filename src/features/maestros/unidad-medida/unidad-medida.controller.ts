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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { UnidadMedidaHandler } from './unidad-medida.handler.js';
import {
  CreateUnidadMedidaDto,
  ListUnidadMedidaQueryDto,
  UnidadMedidaResponseDto,
  UnidadMedidaSelectResponseDto,
  UpdateUnidadMedidaDto,
} from './unidad-medida.dto.js';

@ApiTags('maestros/unidad-medida')
@Controller('maestros/unidad-medida')
export class UnidadMedidaController {
  constructor(private readonly handler: UnidadMedidaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar unidades de medida' })
  @ApiOkResponse({
    description: 'Lista paginada de unidades de medida',
  })
  list(@Query() query: ListUnidadMedidaQueryDto): Promise<Paginated<UnidadMedidaResponseDto>> {
    return this.handler.list(query);
  }

  @Get('select')
  @ApiOperation({ summary: 'Listar unidades de medida para selector (id y nombre)' })
  @ApiOkResponse({
    type: UnidadMedidaSelectResponseDto,
    isArray: true,
    description: 'Listado mínimo (id y nombre) de unidades de medida',
  })
  select(): Promise<UnidadMedidaSelectResponseDto[]> {
    return this.handler.select();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una unidad de medida por id' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida' })
  @ApiOkResponse({ type: UnidadMedidaResponseDto, description: 'Unidad de medida encontrada' })
  @ApiNotFoundResponse({ description: 'Unidad de medida no encontrada' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<UnidadMedidaResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una unidad de medida' })
  @ApiCreatedResponse({ type: UnidadMedidaResponseDto, description: 'Unidad de medida creada' })
  @ApiConflictResponse({ description: 'El código ya existe' })
  create(@Body() dto: CreateUnidadMedidaDto): Promise<UnidadMedidaResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una unidad de medida' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida' })
  @ApiOkResponse({ type: UnidadMedidaResponseDto, description: 'Unidad de medida actualizada' })
  @ApiNotFoundResponse({ description: 'Unidad de medida no encontrada' })
  @ApiConflictResponse({ description: 'El código ya existe' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUnidadMedidaDto,
  ): Promise<UnidadMedidaResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una unidad de medida' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida' })
  @ApiNoContentResponse({ description: 'Unidad de medida desactivada exitosamente' })
  @ApiNotFoundResponse({ description: 'Unidad de medida no encontrada' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}