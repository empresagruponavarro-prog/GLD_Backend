import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

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
  @ApiPropertyOptional({ description: 'URL http(s) o clave local devuelta por POST archivo' })
  @IsOptional() @IsString() @MaxLength(1000)
  archivo_url?: string;
}

export class ArchivoDocumentoDto {
  @ApiProperty({ description: 'Clave relativa para guardar en archivo_url' }) archivo_url: string;
  @ApiProperty() nombre_original: string;
  @ApiProperty() bytes: number;
}

export class DescartarArchivoDocumentoDto {
  @ApiProperty() deleted: boolean;
  @ApiProperty() clave: string;
}

export class EliminarDocumentoDto {
  @ApiProperty() deleted: boolean;
  @ApiProperty() id: number;
}

/** Opcional: omitido = no se toca; null = se limpia; valor = se valida. */
const SiPresente = () => ValidateIf((_, v) => v !== undefined && v !== null);
/** Obligatorio en BD: omitido = no se toca; null = 400. */
const SiDefinido = () => ValidateIf((_, v) => v !== undefined);

export class UpdateObraDocumentoDto {
  @ApiPropertyOptional() @SiDefinido() @IsString() @IsNotEmpty() @MaxLength(255) titulo?: string;
  @ApiPropertyOptional({ nullable: true }) @SiPresente() @IsString() @MaxLength(1000) subtitulo?: string | null;
  @ApiPropertyOptional({ enum: CATEGORIAS_DOCUMENTO }) @SiDefinido() @IsIn(CATEGORIAS_DOCUMENTO) categoria?: string;
  @ApiPropertyOptional({ nullable: true }) @SiPresente() @IsString() @MaxLength(100) nro_registro?: string | null;
  @ApiPropertyOptional({ nullable: true }) @SiPresente() @IsDateString() fecha_emision?: string | null;
  @ApiPropertyOptional({ nullable: true }) @SiPresente() @IsString() @MaxLength(100) vigencia_texto?: string | null;
  @ApiPropertyOptional({ enum: ESTADOS_DOCUMENTO }) @SiDefinido() @IsIn(ESTADOS_DOCUMENTO) estado?: string;
  @ApiPropertyOptional({ nullable: true, description: 'URL http(s) o clave local de la obra; null limpia el archivo' })
  @SiPresente() @IsString() @MaxLength(1000)
  archivo_url?: string | null;
}
