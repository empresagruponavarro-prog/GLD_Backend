import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { toBoolean } from '../../../platform/db/transform.js';

const DECIMAL = /^\d+(\.\d+)?$/;
export const TIPO_PRODUCTO_VALUES = ['PRODUCTO', 'SERVICIO'] as const;
export type TipoProducto = (typeof TIPO_PRODUCTO_VALUES)[number];
export const CLASE_INVENTARIO_VALUES = ['CONSUMIBLE', 'EQUIPO_RETORNABLE', 'MERCADERIA_CLIENTE'] as const;
export type ClaseInventario = (typeof CLASE_INVENTARIO_VALUES)[number];
export const ESTADO_OPERATIVO_VALUES = ['NORMAL', 'NO_OPERATIVO', 'DESCONTINUADO'] as const;
export type EstadoOperativo = (typeof ESTADO_OPERATIVO_VALUES)[number];

export class CreateProductoDto {
  @ApiPropertyOptional({
    example: 'PROD-001',
    description:
      'Código libre. Obligatorio si no se indica id_familia; si se indica id_familia el código se genera solo (PREFIJO-0001) y este campo se rechaza',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codigo?: string;

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

  @ApiPropertyOptional({ example: 1, description: 'Familia de almacén (CON, HER, EPP...). Genera el código automático. No editable luego' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  id_familia?: number;

  @ApiPropertyOptional({ enum: CLASE_INVENTARIO_VALUES, default: 'CONSUMIBLE' })
  @IsOptional()
  @IsIn(CLASE_INVENTARIO_VALUES)
  clase_inventario?: ClaseInventario;

  @ApiPropertyOptional({ example: 'Sellado y pegado' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  uso_principal?: string;

  @ApiPropertyOptional({ example: '10', description: 'Stock mínimo (global)' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL, { message: 'stock_minimo debe ser un decimal válido' })
  stock_minimo?: string;

  @ApiPropertyOptional({ example: '20', description: 'Stock objetivo (global)' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL, { message: 'stock_objetivo debe ser un decimal válido' })
  stock_objetivo?: string;

  @ApiPropertyOptional({ enum: ESTADO_OPERATIVO_VALUES, default: 'NORMAL' })
  @IsOptional()
  @IsIn(ESTADO_OPERATIVO_VALUES)
  estado_operativo?: EstadoOperativo;

  @ApiPropertyOptional({ example: 1, description: 'Almacén por defecto (ubicación)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  id_almacen_default?: number;

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
  @ApiPropertyOptional({ description: 'Filtro por familia de almacén' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id_familia?: number;

  @ApiPropertyOptional({ enum: CLASE_INVENTARIO_VALUES, description: 'Filtro por clase de inventario' })
  @IsOptional()
  @IsIn(CLASE_INVENTARIO_VALUES)
  clase_inventario?: ClaseInventario;

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
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id_categoria?: number;

  @ApiPropertyOptional({ description: 'Filtro por unidad de medida' })
  @IsOptional()
  @Type(() => Number)
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

  @ApiProperty({ example: '100.00', description: 'Stock total (suma de almacenes). Solo lectura: lo mueve el control de almacén' })
  stock: string;

  @ApiPropertyOptional({ example: 1 })
  id_familia: number | null;

  @ApiProperty({ enum: CLASE_INVENTARIO_VALUES })
  clase_inventario: ClaseInventario;

  @ApiPropertyOptional()
  uso_principal: string | null;

  @ApiProperty({ example: '10' })
  stock_minimo: string;

  @ApiProperty({ example: '20' })
  stock_objetivo: string;

  @ApiProperty({ enum: ESTADO_OPERATIVO_VALUES })
  estado_operativo: EstadoOperativo;

  @ApiPropertyOptional()
  id_almacen_default: number | null;

  @ApiProperty({ example: '20.837209', description: 'Costo promedio ponderado móvil. Solo lectura' })
  costo_promedio: string;

  @ApiPropertyOptional({ example: 'Compra directa a proveedor', description: 'Comentarios o notas adicionales' })
  comentarios: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cemento.png', description: 'URL de la imagen' })
  imagen_url: string | null;

  @ApiProperty({ example: true, description: 'Estado activo o inactivo' })
  estado: boolean;
}

export class AlternativaItemDto {
  @ApiProperty({ example: 2, description: 'Producto alternativo' })
  @IsInt()
  @IsPositive()
  id_producto_alternativo: number;

  @ApiProperty({ example: 1, minimum: 1, maximum: 3, description: 'Orden de la alternativa (1 a 3)' })
  @IsInt()
  @Min(1)
  @Max(3)
  prioridad: number;
}

export class ReplaceAlternativasDto {
  @ApiProperty({ type: [AlternativaItemDto], description: 'Reemplaza la lista completa (máx. 3)' })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => AlternativaItemDto)
  alternativas: AlternativaItemDto[];
}

export class AlternativaResponseDto {
  @ApiProperty() id_producto_alternativo: number;
  @ApiProperty() prioridad: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
}

export type ProductoRow = ProductoResponseDto;