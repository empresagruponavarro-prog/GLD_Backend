import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { toBoolean } from '../../../platform/db/transform.js';

export class CreateCategoriaDto {
  @ApiProperty({ example: 'MAT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codigo: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  id_tipo_categoria: number;

  @ApiPropertyOptional({ example: 'Materiales' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateCategoriaDto extends PartialType(CreateCategoriaDto) {}

export class ListCategoriaQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ description: 'Filtro por estado' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  estado?: boolean;
}

export class CategoriaResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador único de la categoría' })
  id: number;

  @ApiProperty({ example: 'MAT', description: 'Código único de la categoría' })
  codigo: string;

  @ApiProperty({ example: 1, description: 'ID del tipo de categoría al que pertenece' })
  id_tipo_categoria: number;

  @ApiPropertyOptional({ example: 'Materiales de construcción', description: 'Descripción detallada' })
  descripcion: string | null;

  @ApiProperty({ example: true, description: 'Estado activo o inactivo de la categoría' })
  estado: boolean;
}

export type CategoriaRow = CategoriaResponseDto;