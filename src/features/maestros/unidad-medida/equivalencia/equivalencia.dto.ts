import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../../platform/db/pagination.dto.js';
import { toBoolean } from '../../../../platform/db/transform.js';

const DECIMAL = /^\d+(\.\d+)?$/;

export class CreateEquivalenciaDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @IsPositive()
  id_uni_med_destino: number;

  @ApiProperty({ example: '100' })
  @IsString()
  @IsNotEmpty()
  @Matches(DECIMAL, { message: 'factor_conversion debe ser un decimal válido' })
  factor_conversion: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateEquivalenciaDto extends PartialType(CreateEquivalenciaDto) {}

export class ListEquivalenciaQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtro por unidad destino' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  id_uni_med_destino?: number;

  @ApiPropertyOptional({ description: 'Filtro por estado' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  estado?: boolean;
}

export type EquivalenciaRow = {
  id: number;
  id_uni_med_origen: number;
  id_uni_med_destino: number;
  factor_conversion: string;
  estado: boolean;
};