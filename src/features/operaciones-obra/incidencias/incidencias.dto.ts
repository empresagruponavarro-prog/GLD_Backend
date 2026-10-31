import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ESTADOS_INCIDENCIA, PRIORIDADES_INCIDENCIA } from '../shared/obra-shared.js';

export class ObraIncidenciaDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo_incidencia: string;
  @ApiProperty() titulo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ enum: PRIORIDADES_INCIDENCIA }) prioridad: string;
  @ApiPropertyOptional() responsable?: string;
  @ApiPropertyOptional() accion_solicitada_o_ejecutada?: string;
  @ApiPropertyOptional() plazo_resolucion?: string;
  @ApiProperty({ enum: ESTADOS_INCIDENCIA }) estado: string;
  @ApiProperty() fecha_reporte: string;
  @ApiPropertyOptional() fecha_resolucion?: string;
  /** Subpartida a la que se atribuye el retraso o el problema (motivo del atraso). */
  @ApiPropertyOptional({ nullable: true }) id_subpartida?: number;
}

export class CreateObraIncidenciaDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) titulo: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1000) descripcion: string;
  @ApiPropertyOptional({ enum: PRIORIDADES_INCIDENCIA }) @IsOptional() @IsIn(PRIORIDADES_INCIDENCIA) prioridad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) responsable?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) accion_solicitada_o_ejecutada?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) plazo_resolucion?: string;
  @ApiPropertyOptional({ nullable: true, description: 'Subpartida de esta obra a la que se atribuye' }) @IsOptional() @IsInt() @Type(() => Number) id_subpartida?: number | null;
}

export class UpdateObraIncidenciaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) titulo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(1000) descripcion?: string;
  @ApiPropertyOptional({ enum: PRIORIDADES_INCIDENCIA }) @IsOptional() @IsIn(PRIORIDADES_INCIDENCIA) prioridad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) responsable?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) accion_solicitada_o_ejecutada?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) plazo_resolucion?: string;
  @ApiPropertyOptional({ enum: ESTADOS_INCIDENCIA }) @IsOptional() @IsIn(ESTADOS_INCIDENCIA) estado?: string;
  @ApiPropertyOptional({ nullable: true, description: 'Subpartida de esta obra a la que se atribuye' }) @IsOptional() @IsInt() @Type(() => Number) id_subpartida?: number | null;
}
