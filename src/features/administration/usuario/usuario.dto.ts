import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUsuarioDto {
  @ApiProperty({ example: 'U-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdUsuario: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  Nombres: string;

  @ApiProperty({ example: 'jperez' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  Usuario: string;

  @ApiPropertyOptional({ default: '123456' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Clave?: string;

  @ApiPropertyOptional({ default: 'Usuario' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Rol?: string;
}

export class UpdateUsuarioDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Nombres?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Usuario?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Clave?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Rol?: string;
}

export class UsuarioResponseDto {
  @ApiProperty({ example: 'U-001', description: 'Identificador único del usuario' })
  IdUsuario: string;

  @ApiProperty({ example: 'Juan Pérez', description: 'Nombres completos del usuario' })
  Nombres: string | null;

  @ApiProperty({ example: 'jperez', description: 'Nombre de usuario / cuenta de acceso' })
  Usuario: string | null;

  @ApiPropertyOptional({ example: '123456', description: 'Clave de acceso' })
  Clave: string | null;

  @ApiProperty({ example: 'Usuario', description: 'Rol asignado al usuario' })
  Rol: string | null;
}

export type UsuarioRow = UsuarioResponseDto;