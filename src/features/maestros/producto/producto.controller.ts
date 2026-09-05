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
import { ProductoHandler } from './producto.handler.js';
import {
  CreateProductoDto,
  ListProductoQueryDto,
  ProductoResponseDto,
  UpdateProductoDto,
} from './producto.dto.js';

@ApiTags('maestros/producto')
@Controller('maestros/producto')
export class ProductoController {
  constructor(private readonly handler: ProductoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos' })
  @ApiOkResponse({
    description: 'Lista paginada de productos registrados',
  })
  list(@Query() query: ListProductoQueryDto): Promise<Paginated<ProductoResponseDto>> {
    return this.handler.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un producto por id' })
  @ApiParam({ name: 'id', description: 'ID numérico del producto', type: Number })
  @ApiOkResponse({ type: ProductoResponseDto, description: 'Producto encontrado' })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<ProductoResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un producto' })
  @ApiCreatedResponse({
    type: ProductoResponseDto,
    description: 'Producto creado exitosamente',
  })
  @ApiBadRequestResponse({ description: 'La categoría o unidad de medida especificada no existe' })
  @ApiConflictResponse({ description: 'El código de producto ya existe' })
  create(@Body() dto: CreateProductoDto): Promise<ProductoResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un producto' })
  @ApiParam({ name: 'id', description: 'ID numérico del producto', type: Number })
  @ApiOkResponse({
    type: ProductoResponseDto,
    description: 'Producto actualizado exitosamente',
  })
  @ApiBadRequestResponse({ description: 'La categoría o unidad de medida especificada no existe' })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  @ApiConflictResponse({ description: 'El código de producto ya existe' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductoDto,
  ): Promise<ProductoResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un producto' })
  @ApiParam({ name: 'id', description: 'ID numérico del producto', type: Number })
  @ApiNoContentResponse({ description: 'Producto desactivado exitosamente' })
  @ApiNotFoundResponse({ description: 'Producto no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}