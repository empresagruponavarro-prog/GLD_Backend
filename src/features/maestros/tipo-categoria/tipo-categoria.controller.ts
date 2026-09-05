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
import { TipoCategoriaHandler } from './tipo-categoria.handler.js';
import {
  CreateTipoCategoriaDto,
  ListTipoCategoriaQueryDto,
  TipoCategoriaResponseDto,
  UpdateTipoCategoriaDto,
} from './tipo-categoria.dto.js';

@ApiTags('maestros/tipo-categoria')
@Controller('maestros/tipo-categoria')
export class TipoCategoriaController {
  constructor(private readonly handler: TipoCategoriaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar tipos de categoría' })
  @ApiOkResponse({
    description: 'Lista paginada de tipos de categoría',
  })
  list(@Query() query: ListTipoCategoriaQueryDto): Promise<Paginated<TipoCategoriaResponseDto>> {
    return this.handler.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un tipo de categoría por id' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del tipo de categoría' })
  @ApiOkResponse({ type: TipoCategoriaResponseDto })
  @ApiNotFoundResponse({ description: 'Tipo de categoría no encontrado' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<TipoCategoriaResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un tipo de categoría' })
  @ApiCreatedResponse({ type: TipoCategoriaResponseDto })
  @ApiConflictResponse({ description: 'El código ya existe' })
  create(@Body() dto: CreateTipoCategoriaDto): Promise<TipoCategoriaResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un tipo de categoría' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del tipo de categoría' })
  @ApiOkResponse({ type: TipoCategoriaResponseDto })
  @ApiNotFoundResponse({ description: 'Tipo de categoría no encontrado' })
  @ApiConflictResponse({ description: 'El código ya existe' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoCategoriaDto,
  ): Promise<TipoCategoriaResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un tipo de categoría' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del tipo de categoría' })
  @ApiNoContentResponse({ description: 'Tipo de categoría desactivado' })
  @ApiNotFoundResponse({ description: 'Tipo de categoría no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}