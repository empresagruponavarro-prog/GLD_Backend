import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';
import { ROLES_EQUIPO, type RolEquipo } from '../shared/control-avance/equipo.js';

export const ESTADOS_PLANTA = ['En Planta', 'Fuera de Planta', 'Vacaciones', 'Retirado'] as const;

export class ObraResidenteDto {
  /** Fila del directorio; `null` en una persona del equipo de la ficha que aún no tiene datos de obra propios. */
  @ApiProperty({ type: Number, nullable: true }) id: number | null;
  /** Identificador estable de la tarjeta: `equipo-<idAnexo>` o `res-<id>`. */
  @ApiProperty() clave: string;
  /**
   * `equipo`: sale del equipo de la ficha técnica (nombre y cargo no se editan aquí; una persona con dos roles tiene dos
   * tarjetas); `directorio`: agregado a mano; `historial`: persona que ya no ocupa ese rol (GRP S-06).
   */
  @ApiProperty({ enum: ['equipo', 'directorio', 'historial'] }) origen: 'equipo' | 'directorio' | 'historial';
  /** Equipo de la ficha: desde cuándo ocupa el rol, si se registró el alta (`YYYY-MM-DD`). */
  @ApiPropertyOptional() fecha_alta?: string;
  /** Historial: hasta cuándo ocupó el rol (`YYYY-MM-DD`). */
  @ApiPropertyOptional() fecha_baja?: string;
  @ApiPropertyOptional({ enum: ROLES_EQUIPO, isArray: true }) roles_equipo?: RolEquipo[];
  @ApiPropertyOptional() id_anexo?: number;
  @ApiProperty() nombre_completo: string;
  @ApiProperty() rol_obra: string;
  @ApiPropertyOptional() especialidad?: string;
  @ApiPropertyOptional() telefono?: string;
  @ApiPropertyOptional() correo?: string;
  /** Equipo de la ficha: teléfono y correo de obra escritos en el directorio (tienen prioridad). */
  @ApiPropertyOptional() telefono_obra?: string;
  @ApiPropertyOptional() correo_obra?: string;
  /** Equipo de la ficha: contacto en RR.HH. › Trabajadores (el institucional antes que el personal). */
  @ApiPropertyOptional() telefono_trabajador?: string;
  @ApiPropertyOptional() correo_trabajador?: string;
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
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) especialidad?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(150) correo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) turno?: string;
  @ApiPropertyOptional({ enum: ESTADOS_PLANTA }) @IsOptional() @IsIn(ESTADOS_PLANTA) estado_planta?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) orden?: number;
}

/** Datos de obra de una persona del equipo de la ficha. Vacío ('' o null) = sin dato propio: se usa el de Trabajadores. */
export class DatosEquipoDirectorioDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(150) especialidad?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(50) telefono?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((o: DatosEquipoDirectorioDto) => !!o.correo) @IsEmail() @MaxLength(150) correo?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) turno?: string | null;
  @ApiPropertyOptional({ enum: ESTADOS_PLANTA }) @IsOptional() @IsIn(ESTADOS_PLANTA) estado_planta?: string;
}
