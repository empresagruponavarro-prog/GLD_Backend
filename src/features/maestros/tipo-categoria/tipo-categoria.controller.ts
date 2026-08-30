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
import { TipoCategoriaHandler } from './tipo-categoria.handler.js';
import {
  CreateTipoCategoriaDto,
  type TipoCategoriaRow,
  UpdateTipoCategoriaDto,
} from './tipo-categoria.dto.js';

@ApiTags('maestros/tipo-categoria')
@Controller('maestros/tipo-categoria')
export class TipoCategoriaController {
  constructor(private readonly handler: TipoCategoriaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar tipos de categoría' })
  list(): Promise<TipoCategoriaRow[]> {
    return this.handler.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un tipo de categoría por id' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<TipoCategoriaRow> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un tipo de categoría' })
  create(@Body() dto: CreateTipoCategoriaDto): Promise<TipoCategoriaRow> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un tipo de categoría' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoCategoriaDto,
  ): Promise<TipoCategoriaRow> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un tipo de categoría' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}