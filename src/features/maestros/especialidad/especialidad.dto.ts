import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export enum TipoAnexo {
  Proveedor = 'Proveedor',
  Cliente = 'Cliente',
  Trabajador = 'Trabajador',
}

export class CreateEspecialidadDto {
  @ApiPropertyOptional({ enum: TipoAnexo, example: TipoAnexo.Proveedor })
  @IsOptional()
  @IsEnum(TipoAnexo)
  tipoAnexo?: TipoAnexo;

  @ApiPropertyOptional({ example: 'ESPECIALIDAD DE ANEXO' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;
}

export class UpdateEspecialidadDto extends PartialType(CreateEspecialidadDto) {}

export class ListEspecialidadQueryDto extends PaginationQueryDto {
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

export class EspecialidadResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: TipoAnexo, nullable: true })
  tipoAnexo: TipoAnexo | null;

  @ApiProperty({ example: 'ESPECIALIDAD DE ANEXO', nullable: true })
  descripcion: string | null;
}

export class EspecialidadSelectQueryDto {
  @ApiPropertyOptional({ enum: TipoAnexo, description: 'Filtro por tipo de anexo' })
  @IsOptional()
  @IsEnum(TipoAnexo)
  tipoAnexo?: TipoAnexo;
}

export class EspecialidadSelectResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'ESPECIALIDAD DE ANEXO', nullable: true })
  nombre: string | null;
}