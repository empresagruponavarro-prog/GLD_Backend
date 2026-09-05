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

export type ProductoRow = {
  id: number;
  codigo: string;
  descripcion: string;
  id_categoria: number;
  id_unidad_medida: number;
  tipo_producto: TipoProducto;
  stock: string;
  comentarios: string | null;
  imagen_url: string | null;
  estado: boolean;
};