import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { toBoolean } from '../../../platform/db/transform.js';

const DECIMAL = /^\d+(\.\d+)?$/;
export const TIPO_PRODUCTO_VALUES = ['PRODUCTO', 'SERVICIO'] as const;
export type TipoProducto = (typeof TIPO_PRODUCTO_VALUES)[number];

export class CreateProductoDto {
  @ApiProperty({ example: 'PROD-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codigo: string;

  @ApiProperty({ example: 'CEMENTO PORTLAND' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  descripcion: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  id_categoria: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  id_unidad_medida: number;

  @ApiPropertyOptional({ enum: TIPO_PRODUCTO_VALUES, default: 'PRODUCTO' })
  @IsOptional()
  @IsIn(TIPO_PRODUCTO_VALUES)
  tipo_producto?: TipoProducto;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL, { message: 'stock debe ser un decimal válido' })
  stock?: string;

  @ApiPropertyOptional({ example: 'Compra directa' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentarios?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/img.png' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imagen_url?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateProductoDto extends PartialType(CreateProductoDto) {}

export class ListProductoQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtro parcial por código' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  codigo?: string;

  @ApiPropertyOptional({ description: 'Filtro parcial por descripción' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Filtro por categoría' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  id_categoria?: number;

  @ApiPropertyOptional({ description: 'Filtro por unidad de medida' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  id_unidad_medida?: number;

  @ApiPropertyOptional({ enum: TIPO_PRODUCTO_VALUES, description: 'Filtro por tipo' })
  @IsOptional()
  @IsIn(TIPO_PRODUCTO_VALUES)
  tipo_producto?: TipoProducto;

  @ApiPropertyOptional({ description: 'Filtro por estado' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  estado?: boolean;
}

export class ProductoSelectQueryDto {
  @ApiPropertyOptional({ enum: TIPO_PRODUCTO_VALUES, description: 'Filtro por tipo de producto' })
  @IsOptional()
  @IsIn(TIPO_PRODUCTO_VALUES)
  tipo_producto?: TipoProducto;
}

export class ProductoSelectResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'CEMENTO PORTLAND TIPO I' })
  descripcion: string;
}

export class ProductoResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador único del producto' })
  id: number;

  @ApiProperty({ example: 'PROD-001', description: 'Código único del producto' })
  codigo: string;

  @ApiProperty({ example: 'CEMENTO PORTLAND TIPO I', description: 'Descripción detallada del producto' })
  descripcion: string;

  @ApiProperty({ example: 1, description: 'ID de la categoría a la que pertenece' })
  id_categoria: number;

  @ApiProperty({ example: 1, description: 'ID de la unidad de medida principal' })
  id_unidad_medida: number;

  @ApiProperty({ enum: TIPO_PRODUCTO_VALUES, example: 'PRODUCTO', description: 'Tipo: PRODUCTO o SERVICIO' })
  tipo_producto: TipoProducto;

  @ApiProperty({ example: '100.00', description: 'Stock actual disponible' })
  stock: string;

  @ApiPropertyOptional({ example: 'Compra directa a proveedor', description: 'Comentarios o notas adicionales' })
  comentarios: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cemento.png', description: 'URL de la imagen' })
  imagen_url: string | null;

  @ApiProperty({ example: true, description: 'Estado activo o inactivo' })
  estado: boolean;
}

export type ProductoRow = ProductoResponseDto;