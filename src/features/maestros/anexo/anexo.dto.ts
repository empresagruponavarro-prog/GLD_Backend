import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { toBoolean } from '../../../platform/db/transform.js';

export enum TipoAnexo {
  Proveedor = 'Proveedor',
  Cliente = 'Cliente',
  Trabajador = 'Trabajador',
}

export class CreateAnexoDto {
  @ApiPropertyOptional({ enum: TipoAnexo, example: TipoAnexo.Proveedor })
  @IsOptional()
  @IsEnum(TipoAnexo)
  tipoAnexo?: TipoAnexo;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  AnexoEspecialidadId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  AnexoTipoDocIdeId?: number;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  NumeroDocIde?: string;

  @ApiPropertyOptional({ example: 'ACME S.A.C.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Anexo?: string;

  @ApiPropertyOptional({ example: 'ACME' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  NombreComercial?: string;

  @ApiPropertyOptional({ example: 'Av. Principal 123' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Direccion?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Contacto?: string;

  @ApiPropertyOptional({ example: '987654321' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Telefono?: string;

  @ApiPropertyOptional({ example: 'correo@acme.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Correo?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateAnexoDto extends PartialType(CreateAnexoDto) {}

export class ListAnexoQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TipoAnexo, description: 'Filtro por tipo de anexo' })
  @IsOptional()
  @IsEnum(TipoAnexo)
  tipoAnexo?: TipoAnexo;

  @ApiPropertyOptional({ description: 'Filtro por especialidad (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  AnexoEspecialidadId?: number;

  @ApiPropertyOptional({ description: 'Filtro por tipo de documento de identidad (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  AnexoTipoDocIdeId?: number;

  @ApiPropertyOptional({ description: 'Filtro parcial por anexo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Anexo?: string;

  @ApiPropertyOptional({ description: 'Filtro parcial por nombre comercial' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  NombreComercial?: string;

  @ApiPropertyOptional({ description: 'Filtro por estado' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  estado?: boolean;
}

export class AnexoSelectQueryDto {
  @ApiPropertyOptional({ enum: TipoAnexo, description: 'Filtro por tipo de anexo' })
  @IsOptional()
  @IsEnum(TipoAnexo)
  tipoAnexo?: TipoAnexo;
}

export class AnexoSelectResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'J & J INVERSIONES CONSTRUCTIVAS S.A.C.', nullable: true })
  nombre: string | null;
}

export class AnexoResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: TipoAnexo, nullable: true })
  tipoAnexo: TipoAnexo | null;

  @ApiProperty({ example: 1, nullable: true })
  AnexoEspecialidadId: number | null;

  @ApiProperty({ example: 1, nullable: true })
  AnexoTipoDocIdeId: number | null;

  @ApiProperty({ example: '12345678', nullable: true })
  NumeroDocIde: string | null;

  @ApiProperty({ example: 'ACME S.A.C.', nullable: true })
  Anexo: string | null;

  @ApiProperty({ example: 'ACME', nullable: true })
  NombreComercial: string | null;

  @ApiProperty({ example: 'Av. Principal 123', nullable: true })
  Direccion: string | null;

  @ApiProperty({ example: 'Juan Pérez', nullable: true })
  Contacto: string | null;

  @ApiProperty({ example: '987654321', nullable: true })
  Telefono: string | null;

  @ApiProperty({ example: 'correo@acme.com', nullable: true })
  Correo: string | null;

  @ApiProperty({ example: true })
  estado: boolean;
}