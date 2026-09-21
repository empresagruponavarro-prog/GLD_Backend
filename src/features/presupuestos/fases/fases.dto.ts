import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export class CreatePptoFaseDto {
  @ApiProperty({ example: 'FASE-01', description: 'Código único de la fase' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdpptoFase: string;

  @ApiPropertyOptional({ example: 1, description: 'Identificador de empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_empresa?: number;

  @ApiPropertyOptional({ example: 25, description: 'ID del centro de costo principal (cadena)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_centro_costos_principal?: number;

  @ApiPropertyOptional({ example: 'ESTRUCTURAS Y ALBAÑILERIA', description: 'Nombre o descripción de la fase' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  FaseProyecto?: string;
}

export class UpdatePptoFaseDto extends PartialType(CreatePptoFaseDto) {}

export class ListPptoFaseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtro por código de fase' })
  @IsOptional()
  @IsString()
  IdpptoFase?: string;

  @ApiPropertyOptional({ description: 'Filtro por nombre de fase del proyecto' })
  @IsOptional()
  @IsString()
  FaseProyecto?: string;

  @ApiPropertyOptional({ description: 'Filtro por empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id_empresa?: number;

  @ApiPropertyOptional({ description: 'Filtro por ID de centro de costo (tienda u obra)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id_centro_costo?: number;

  @ApiPropertyOptional({ description: 'Filtro por ID de centro de costo principal (cadena)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id_centro_costos_principal?: number;
}

export class PptoFaseResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'FASE-01' })
  IdpptoFase: string | null;

  @ApiPropertyOptional({ example: 1 })
  id_empresa: number | null;

  @ApiPropertyOptional({ example: 25 })
  id_centro_costos_principal: number | null;

  @ApiPropertyOptional({ example: 'ESTRUCTURAS Y ALBAÑILERIA' })
  FaseProyecto: string | null;
}
