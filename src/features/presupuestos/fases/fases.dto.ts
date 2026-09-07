import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export class CreatePptoFaseDto {
  @ApiProperty({ example: 'FASE-01', description: 'Código único de la fase' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdpptoFase: string;

  @ApiPropertyOptional({ example: 'E1', description: 'Código de empresa' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodEmpresa?: string;

  @ApiPropertyOptional({ example: '617d63d6', description: 'Código de centro de costo principal' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodCentroCtoPrincipal?: string;

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
  @IsString()
  CodEmpresa?: string;
}

export class PptoFaseResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'FASE-01' })
  IdpptoFase: string | null;

  @ApiPropertyOptional({ example: 'E1' })
  CodEmpresa: string | null;

  @ApiPropertyOptional({ example: '617d63d6' })
  CodCentroCtoPrincipal: string | null;

  @ApiPropertyOptional({ example: 'ESTRUCTURAS Y ALBAÑILERIA' })
  FaseProyecto: string | null;
}
