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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriaHandler } from './categoria.handler.js';
import { CreateCategoriaDto, type CategoriaRow, UpdateCategoriaDto } from './categoria.dto.js';

@ApiTags('maestros/categoria')
@Controller('maestros/categoria')
export class CategoriaController {
  constructor(private readonly handler: CategoriaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorías' })
  list(): Promise<CategoriaRow[]> {
    return this.handler.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una categoría por id' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<CategoriaRow> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una categoría' })
  create(@Body() dto: CreateCategoriaDto): Promise<CategoriaRow> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una categoría' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoriaDto,
  ): Promise<CategoriaRow> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar una categoría (borrado lógico)' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}