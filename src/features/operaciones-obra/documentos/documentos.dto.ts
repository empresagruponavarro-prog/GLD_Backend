import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const CATEGORIAS_DOCUMENTO = ['Acta', 'Permiso', 'Seguridad', 'Calidad', 'Contrato', 'Otros'] as const;
export const ESTADOS_DOCUMENTO = ['Validado', 'Pendiente', 'Observado', 'Vencido'] as const;

export class ObraDocumentoDto {
  @ApiProperty() id: number;
  @ApiProperty() titulo: string;
  @ApiPropertyOptional() subtitulo?: string;
  @ApiProperty() categoria: string;
  @ApiPropertyOptional() nro_registro?: string;
  @ApiPropertyOptional() fecha_emision?: string;
  @ApiPropertyOptional() vigencia_texto?: string;
  @ApiProperty() estado: string;
  @ApiPropertyOptional() archivo_url?: string;
  @ApiProperty() created_at: string;
}

export class CreateObraDocumentoDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) titulo: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) subtitulo?: string;
  @ApiProperty({ enum: CATEGORIAS_DOCUMENTO }) @IsIn(CATEGORIAS_DOCUMENTO) categoria: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) nro_registro?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fecha_emision?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) vigencia_texto?: string;
  @ApiPropertyOptional({ enum: ESTADOS_DOCUMENTO }) @IsOptional() @IsIn(ESTADOS_DOCUMENTO) estado?: string;
  @ApiPropertyOptional({ description: 'Enlace externo al archivo (la subida real se define en la Fase D)' })
  @IsOptional() @IsString() @MaxLength(1000)
  archivo_url?: string;
}

export class UpdateObraDocumentoDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) titulo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) subtitulo?: string;
  @ApiPropertyOptional({ enum: CATEGORIAS_DOCUMENTO }) @IsOptional() @IsIn(CATEGORIAS_DOCUMENTO) categoria?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) nro_registro?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() fecha_emision?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) vigencia_texto?: string;
  @ApiPropertyOptional({ enum: ESTADOS_DOCUMENTO }) @IsOptional() @IsIn(ESTADOS_DOCUMENTO) estado?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) archivo_url?: string;
}
