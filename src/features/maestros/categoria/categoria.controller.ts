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
import { type Paginated } from '../../../platform/db/pagination.js';
import { CategoriaHandler } from './categoria.handler.js';
import {
  CategoriaResponseDto,
  CreateCategoriaDto,
  ListCategoriaQueryDto,
  UpdateCategoriaDto,
} from './categoria.dto.js';

@ApiTags('maestros/categoria')
@Controller('maestros/categoria')
export class CategoriaController {
  constructor(private readonly handler: CategoriaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías' })
  @ApiOkResponse({
    description: 'Lista paginada de categorías registradas',
  })
  list(@Query() query: ListCategoriaQueryDto): Promise<Paginated<CategoriaResponseDto>> {
    return this.handler.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una categoría por id' })
  @ApiParam({ name: 'id', description: 'ID numérico de la categoría', type: Number })
  @ApiOkResponse({ type: CategoriaResponseDto, description: 'Categoría encontrada' })
  @ApiNotFoundResponse({ description: 'Categoría no encontrada' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<CategoriaResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una categoría' })
  @ApiCreatedResponse({
    type: CategoriaResponseDto,
    description: 'Categoría creada exitosamente',
  })
  @ApiBadRequestResponse({ description: 'El tipo de categoría especificado no existe' })
  @ApiConflictResponse({ description: 'El código de categoría ya existe' })
  create(@Body() dto: CreateCategoriaDto): Promise<CategoriaResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una categoría' })
  @ApiParam({ name: 'id', description: 'ID numérico de la categoría', type: Number })
  @ApiOkResponse({
    type: CategoriaResponseDto,
    description: 'Categoría actualizada exitosamente',
  })
  @ApiBadRequestResponse({ description: 'El tipo de categoría especificado no existe' })
  @ApiNotFoundResponse({ description: 'Categoría no encontrada' })
  @ApiConflictResponse({ description: 'El código de categoría ya existe' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoriaDto,
  ): Promise<CategoriaResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar una categoría (borrado lógico)' })
  @ApiParam({ name: 'id', description: 'ID numérico de la categoría', type: Number })
  @ApiNoContentResponse({ description: 'Categoría desactivada exitosamente' })
  @ApiNotFoundResponse({ description: 'Categoría no encontrada' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}