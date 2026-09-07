import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export class CreatePptoFaseCategoriaDto {
  @ApiProperty({ example: 'CAT-01', description: 'Código único de la categoría de fase' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdpptoFaseCategoria: string;

  @ApiPropertyOptional({ example: 'FASE-01', description: 'Código IdpptoFase a la que pertenece' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  IdpptoFase?: string;

  @ApiPropertyOptional({ example: 'TRABAJOS PROVISIONALES', description: 'Descripción de la categoría' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Descripcion?: string;
}

export class UpdatePptoFaseCategoriaDto extends PartialType(CreatePptoFaseCategoriaDto) {}

export class ListPptoFaseCategoriaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtro por código de categoría' })
  @IsOptional()
  @IsString()
  IdpptoFaseCategoria?: string;

  @ApiPropertyOptional({ description: 'Filtro por código de fase' })
  @IsOptional()
  @IsString()
  IdpptoFase?: string;

  @ApiPropertyOptional({ description: 'Filtro por descripción' })
  @IsOptional()
  @IsString()
  Descripcion?: string;
}

export class PptoFaseCategoriaResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'CAT-01' })
  IdpptoFaseCategoria: string | null;

  @ApiPropertyOptional({ example: 'FASE-01' })
  IdpptoFase: string | null;

  @ApiPropertyOptional({ example: 'TRABAJOS PROVISIONALES' })
  Descripcion: string | null;
}
