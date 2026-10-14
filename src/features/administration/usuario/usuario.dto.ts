import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CLAVE_MAX, CLAVE_MIN } from '../../../platform/auth/passwords.js';

/** Alta de usuario. El `IdUsuario` lo asigna el backend (correlativo USR-0001, USR-0002…). */
export class CreateUsuarioDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  Nombres: string;

  @ApiProperty({ example: 'jperez', description: 'Login; único sin distinguir mayúsculas' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  Usuario: string;

  @ApiProperty({ minLength: CLAVE_MIN, maxLength: CLAVE_MAX, format: 'password' })
  @IsString()
  @MinLength(CLAVE_MIN)
  @MaxLength(CLAVE_MAX)
  Clave: string;

  @ApiProperty({ example: 'Usuario', maxLength: 50, description: 'Nombre de un rol existente en la tabla rol (400 si no existe)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  Rol: string;
}

export class UpdateUsuarioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Nombres?: string;

  @ApiPropertyOptional({ description: 'Login; único sin distinguir mayúsculas' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  Usuario?: string;

  @ApiPropertyOptional({
    minLength: CLAVE_MIN,
    maxLength: CLAVE_MAX,
    format: 'password',
    description: 'Si se envía, se reemplaza la clave',
  })
  @IsOptional()
  @IsString()
  @MinLength(CLAVE_MIN)
  @MaxLength(CLAVE_MAX)
  Clave?: string;

  @ApiPropertyOptional({ maxLength: 50, description: 'Nombre de un rol existente en la tabla rol (400 si no existe)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  Rol?: string;
}

/** Respuesta de usuarios: NUNCA incluye `Clave`. */
export class UsuarioResponseDto {
  @ApiProperty({ example: 'USR-0001', description: 'Identificador único del usuario (correlativo asignado al crear)' })
  IdUsuario: string;

  @ApiProperty({ example: 'Juan Pérez', description: 'Nombres completos del usuario', nullable: true, type: String })
  Nombres: string | null;

  @ApiProperty({ example: 'jperez', description: 'Nombre de usuario / cuenta de acceso', nullable: true, type: String })
  Usuario: string | null;

  @ApiProperty({ example: 'Usuario', description: 'Rol asignado al usuario', nullable: true, type: String })
  Rol: string | null;
}