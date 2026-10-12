import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const ESTADOS_PLANTA = ['En Planta', 'Fuera de Planta', 'Vacaciones', 'Retirado'] as const;

export class ObraResidenteDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional() id_anexo?: number;
  @ApiProperty() nombre_completo: string;
  @ApiProperty() rol_obra: string;
  @ApiPropertyOptional() cip_cap?: string;
  @ApiPropertyOptional() especialidad?: string;
  @ApiPropertyOptional() telefono?: string;
  @ApiPropertyOptional() correo?: string;
  @ApiPropertyOptional() turno?: string;
  @ApiProperty() estado_planta: string;
  @ApiPropertyOptional() foto_url?: string;
  @ApiProperty() orden: number;
  /** Enlace directo WhatsApp generado al vuelo */
  @ApiPropertyOptional() whatsapp_url?: string;
}

export class CreateObraResidenteDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) id_anexo?: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) nombre_completo: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) rol_obra: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) cip_cap?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) especialidad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(150) correo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) turno?: string;
  @ApiPropertyOptional({ enum: ESTADOS_PLANTA }) @IsOptional() @IsIn(ESTADOS_PLANTA) estado_planta?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) orden?: number;
}

export class UpdateObraResidenteDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) id_anexo?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) nombre_completo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) rol_obra?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) cip_cap?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) especialidad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(150) correo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) turno?: string;
  @ApiPropertyOptional({ enum: ESTADOS_PLANTA }) @IsOptional() @IsIn(ESTADOS_PLANTA) estado_planta?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) orden?: number;
}
