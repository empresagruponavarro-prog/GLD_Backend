import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export enum TipoAnexo {
  Proveedor = 'Proveedor',
  Cliente = 'Cliente',
  Trabajador = 'Trabajador',
}

export class CreateTipoDocIdentidadDto {
  @ApiPropertyOptional({ enum: TipoAnexo, example: TipoAnexo.Proveedor })
  @IsOptional()
  @IsEnum(TipoAnexo)
  tipoAnexo?: TipoAnexo;

  @ApiPropertyOptional({ example: 'DNI' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;
}

export class UpdateTipoDocIdentidadDto extends PartialType(CreateTipoDocIdentidadDto) {}

export class ListTipoDocIdentidadQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TipoAnexo, description: 'Filtro por tipo de anexo' })
  @IsOptional()
  @IsEnum(TipoAnexo)
  tipoAnexo?: TipoAnexo;

  @ApiPropertyOptional({ description: 'Filtro parcial por descripción' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;
}

export class TipoDocIdentidadResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: TipoAnexo, nullable: true })
  tipoAnexo: TipoAnexo | null;

  @ApiProperty({ example: 'DNI', nullable: true })
  descripcion: string | null;
}

export class TipoDocIdentidadSelectQueryDto {
  @ApiPropertyOptional({ enum: TipoAnexo, description: 'Filtro por tipo de anexo' })
  @IsOptional()
  @IsEnum(TipoAnexo)
  tipoAnexo?: TipoAnexo;
}

export class TipoDocIdentidadSelectResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'DNI', nullable: true })
  nombre: string | null;
}