import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { toBoolean } from '../../../platform/db/transform.js';

export class CreateUnidadMedidaDto {
  @ApiProperty({ example: 'CIEN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codigo: string;

  @ApiProperty({ example: 'CIENTO' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  descripcion: string;

  @ApiPropertyOptional({ example: '100' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  simbolo?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateUnidadMedidaDto extends PartialType(CreateUnidadMedidaDto) {}

export class ListUnidadMedidaQueryDto extends PaginationQueryDto {
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

export class UnidadMedidaResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'CIEN' })
  codigo: string;

  @ApiProperty({ example: 'CIENTO' })
  descripcion: string;

  @ApiPropertyOptional({ example: '100' })
  simbolo: string | null;

  @ApiProperty({ example: true })
  estado: boolean;
}

export type UnidadMedidaRow = UnidadMedidaResponseDto;

export class UnidadMedidaSelectResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador único de la unidad de medida' })
  id: number;

  @ApiProperty({
    example: 'CIENTO (100)',
    description: 'Nombre de la unidad (descripción y, si existe, símbolo)',
  })
  nombre: string;
}