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

export type CategoriaRow = {
  id: number;
  codigo: string;
  id_tipo_categoria: number;
  descripcion: string | null;
  estado: boolean;
};