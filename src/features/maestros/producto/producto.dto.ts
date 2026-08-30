import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

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

  @ApiProperty({ required: false, enum: TIPO_PRODUCTO_VALUES, default: 'PRODUCTO' })
  @IsOptional()
  @IsIn(TIPO_PRODUCTO_VALUES)
  tipo_producto?: TipoProducto;

  @ApiProperty({ required: false, example: '0' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL, { message: 'stock debe ser un decimal válido' })
  stock?: string;

  @ApiProperty({ required: false, example: 'Compra directa' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comentarios?: string;

  @ApiProperty({ required: false, example: 'https://cdn.example.com/img.png' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imagen_url?: string;
}

export class UpdateProductoDto extends PartialType(CreateProductoDto) {}

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
};