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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { ProductoHandler } from './producto.handler.js';
import {
  CreateProductoDto,
  ListProductoQueryDto,
  type ProductoRow,
  UpdateProductoDto,
} from './producto.dto.js';

@ApiTags('maestros/producto')
@Controller('maestros/producto')
export class ProductoController {
  constructor(private readonly handler: ProductoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos' })
  list(@Query() query: ListProductoQueryDto): Promise<Paginated<ProductoRow>> {
    return this.handler.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un producto por id' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<ProductoRow> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un producto' })
  create(@Body() dto: CreateProductoDto): Promise<ProductoRow> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un producto' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductoDto,
  ): Promise<ProductoRow> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un producto' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}