import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const DISCIPLINAS_PLANO = ['Arquitectura', 'Estructuras', 'Eléctricas', 'Sanitarias', 'Mecánicas', 'Comunicaciones', 'Otros'] as const;
export const ESTADOS_APROBACION_PLANO = ['Aprobado Obra', 'En Revisión', 'Observado', 'Para Construcción'] as const;

export class ObraPlanoDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo_plano: string;
  @ApiProperty() nombre_plano: string;
  @ApiProperty() disciplina: string;
  @ApiProperty() version: string;
  @ApiProperty() es_vigente: boolean;
  @ApiPropertyOptional() id_plano_anterior?: number;
  @ApiProperty() estado_aprobacion: string;
  @ApiPropertyOptional() fecha_vobo?: string;
  @ApiPropertyOptional() formato_peso?: string;
  @ApiPropertyOptional() archivo_url?: string;
  @ApiPropertyOptional() emitido_por?: string;
  @ApiProperty() created_at: string;
}

export class CreateObraPlanoDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(50) codigo_plano: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) nombre_plano: string;
  @ApiProperty({ enum: DISCIPLINAS_PLANO }) @IsIn(DISCIPLINAS_PLANO) disciplina: string;
  @ApiPropertyOptional({ default: 'v1.0' }) @IsOptional() @IsString() @MaxLength(20) version?: string;
  @ApiPropertyOptional({ enum: ESTADOS_APROBACION_PLANO }) @IsOptional() @IsIn(ESTADOS_APROBACION_PLANO) estado_aprobacion?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fecha_vobo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) formato_peso?: string;
  @ApiPropertyOptional({ description: 'Enlace externo al archivo (la subida real se define en la Fase D)' })
  @IsOptional() @IsString() @MaxLength(1000)
  archivo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) emitido_por?: string;
}

export class UpdateObraPlanoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) nombre_plano?: string;
  @ApiPropertyOptional({ enum: DISCIPLINAS_PLANO }) @IsOptional() @IsIn(DISCIPLINAS_PLANO) disciplina?: string;
  @ApiPropertyOptional({ enum: ESTADOS_APROBACION_PLANO }) @IsOptional() @IsIn(ESTADOS_APROBACION_PLANO) estado_aprobacion?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fecha_vobo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) formato_peso?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) archivo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) emitido_por?: string;
}

/** Emite una nueva revisión de un plano vigente: la anterior queda como histórica. */
export class NuevaVersionPlanoDto {
  @ApiPropertyOptional({ description: 'Si se omite se incrementa automáticamente (v1.0 → v2.0)' })
  @IsOptional() @IsString() @MaxLength(20)
  version?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) nombre_plano?: string;
  @ApiPropertyOptional({ enum: ESTADOS_APROBACION_PLANO }) @IsOptional() @IsIn(ESTADOS_APROBACION_PLANO) estado_aprobacion?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fecha_vobo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) formato_peso?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) archivo_url?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) emitido_por?: string;
}
