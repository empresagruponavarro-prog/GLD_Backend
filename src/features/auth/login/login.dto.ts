import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { UsuarioSesionDto } from '../shared/usuario-sesion.dto.js';

export class LoginDto {
  @ApiProperty({ example: 'jperez', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  usuario: string;

  @ApiProperty({ example: '********', maxLength: 255, format: 'password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  clave: string;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT (HS256) para `Authorization: Bearer <token>`' })
  token: string;

  @ApiProperty({ example: '2026-10-14T23:00:00.000Z', description: 'Expiracion del token (ISO 8601)' })
  expiraEn: string;

  @ApiProperty({ type: UsuarioSesionDto })
  usuario: UsuarioSesionDto;
}
