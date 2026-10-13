import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ESTADOS_SEMANA } from '../shared/obra-shared.js';

export class ObraSemanaDto {
  @ApiProperty() id: number;
  @ApiProperty() numero_semana: number;
  @ApiProperty() etiqueta_semana: string;
  @ApiProperty() fecha_inicio: string;
  @ApiProperty() fecha_fin: string;
  @ApiProperty() fase_principal: string;
  @ApiPropertyOptional() descripcion_actividades?: string;
  @ApiPropertyOptional() responsable_nombre?: string;
  @ApiProperty() porcentaje_meta: number;
  @ApiProperty() porcentaje_real: number;
  @ApiProperty({ enum: ESTADOS_SEMANA }) estado: string;
  @ApiProperty() orden: number;
}

export class CreateObraSemanaDto {
  @ApiPropertyOptional({ description: 'Si se omite se asigna max(numero_semana)+1' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  numero_semana?: number;

  @ApiPropertyOptional({ description: 'Si se omite se genera "SEM NN"' })
  @IsOptional() @IsString() @MaxLength(50)
  etiqueta_semana?: string;

  @ApiProperty({ example: '2026-10-12' }) @IsDateString() fecha_inicio: string;
  @ApiProperty({ example: '2026-10-18' }) @IsDateString() fecha_fin: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) fase_principal: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) descripcion_actividades?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) responsable_nombre?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number) porcentaje_meta?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number) porcentaje_real?: number;

  @ApiPropertyOptional({ enum: ESTADOS_SEMANA }) @IsOptional() @IsIn(ESTADOS_SEMANA) estado?: string;
}

export class UpdateObraSemanaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) etiqueta_semana?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fecha_inicio?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fecha_fin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) fase_principal?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) descripcion_actividades?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) responsable_nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number) porcentaje_meta?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number) porcentaje_real?: number;
  @ApiPropertyOptional({ enum: ESTADOS_SEMANA }) @IsOptional() @IsIn(ESTADOS_SEMANA) estado?: string;
}

export class UpdateAvanceSemanalDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(100) @Type(() => Number) porcentaje_real: number;
  @ApiPropertyOptional({ enum: ESTADOS_SEMANA }) @IsOptional() @IsIn(ESTADOS_SEMANA) estado?: string;
}

export class CreateLoteSemanasDto {
  @ApiProperty({ type: [CreateObraSemanaDto], description: 'Listado de semanas a insertar' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateObraSemanaDto)
  semanas: CreateObraSemanaDto[];

  @ApiPropertyOptional({ description: 'Si es true, elimina las semanas previas del centro de costo antes de insertar' })
  @IsOptional()
  @IsBoolean()
  reemplazar_existentes?: boolean;
}
