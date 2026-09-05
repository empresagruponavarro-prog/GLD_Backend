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
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../../platform/db/pagination.js';
import { EquivalenciaHandler } from './equivalencia.handler.js';
import {
  CreateEquivalenciaDto,
  EquivalenciaResponseDto,
  ListEquivalenciaQueryDto,
  UpdateEquivalenciaDto,
} from './equivalencia.dto.js';

@ApiTags('maestros/unidad-medida')
@Controller('maestros/unidad-medida/:id/equivalencias')
export class EquivalenciaController {
  constructor(private readonly handler: EquivalenciaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar equivalencias de una unidad de medida' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida origen' })
  @ApiOkResponse({
    description: 'Lista paginada de equivalencias de la unidad de medida',
  })
  @ApiNotFoundResponse({ description: 'Unidad de medida origen no encontrada' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListEquivalenciaQueryDto,
  ): Promise<Paginated<EquivalenciaResponseDto>> {
    return this.handler.list(id, query);
  }

  @Get(':equivalenciaId')
  @ApiOperation({ summary: 'Obtener una equivalencia por id' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida origen' })
  @ApiParam({ name: 'equivalenciaId', type: Number, description: 'ID de la equivalencia' })
  @ApiOkResponse({ type: EquivalenciaResponseDto, description: 'Equivalencia encontrada' })
  @ApiNotFoundResponse({ description: 'Equivalencia no encontrada' })
  getById(
    @Param('id', ParseIntPipe) id: number,
    @Param('equivalenciaId', ParseIntPipe) equivalenciaId: number,
  ): Promise<EquivalenciaResponseDto> {
    return this.handler.getById(id, equivalenciaId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una equivalencia' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida origen' })
  @ApiCreatedResponse({ type: EquivalenciaResponseDto, description: 'Equivalencia creada' })
  @ApiBadRequestResponse({ description: 'Unidad destino inválida o igual a origen' })
  @ApiNotFoundResponse({ description: 'Unidad de medida origen no encontrada' })
  @ApiConflictResponse({ description: 'La equivalencia ya existe' })
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEquivalenciaDto,
  ): Promise<EquivalenciaResponseDto> {
    return this.handler.create(id, dto);
  }

  @Patch(':equivalenciaId')
  @ApiOperation({ summary: 'Actualizar una equivalencia' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida origen' })
  @ApiParam({ name: 'equivalenciaId', type: Number, description: 'ID de la equivalencia' })
  @ApiOkResponse({ type: EquivalenciaResponseDto, description: 'Equivalencia actualizada' })
  @ApiBadRequestResponse({ description: 'Unidad destino inválida o igual a origen' })
  @ApiNotFoundResponse({ description: 'Equivalencia no encontrada' })
  @ApiConflictResponse({ description: 'La equivalencia ya existe' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('equivalenciaId', ParseIntPipe) equivalenciaId: number,
    @Body() dto: UpdateEquivalenciaDto,
  ): Promise<EquivalenciaResponseDto> {
    return this.handler.update(id, equivalenciaId, dto);
  }

  @Delete(':equivalenciaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una equivalencia' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad de medida origen' })
  @ApiParam({ name: 'equivalenciaId', type: Number, description: 'ID de la equivalencia' })
  @ApiNoContentResponse({ description: 'Equivalencia desactivada exitosamente' })
  @ApiNotFoundResponse({ description: 'Equivalencia no encontrada' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('equivalenciaId', ParseIntPipe) equivalenciaId: number,
  ): Promise<void> {
    return this.handler.remove(id, equivalenciaId);
  }
}