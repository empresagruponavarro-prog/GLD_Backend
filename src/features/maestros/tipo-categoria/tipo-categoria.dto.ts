import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { toBoolean } from '../../../platform/db/transform.js';

export class CreateTipoCategoriaDto {
  @ApiProperty({ example: 'COSTO_DIRECTO' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codigo: string;

  @ApiProperty({ example: 'COSTO DIRECTO, GASTO GENERAL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateTipoCategoriaDto extends PartialType(CreateTipoCategoriaDto) {}

export class ListTipoCategoriaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtro parcial por código' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  codigo?: string;

  @ApiPropertyOptional({ description: 'Filtro parcial por nombre' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombre?: string;

  @ApiPropertyOptional({ description: 'Filtro por estado' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  estado?: boolean;
}

export type TipoCategoriaRow = {
  id: number;
  codigo: string;
  nombre: string;
  estado: boolean;
};