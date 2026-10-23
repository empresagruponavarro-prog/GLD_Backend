import { ForbiddenException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export const USUARIO_INACTIVO = 'Tu usuario está desactivado. Contacta al administrador';
export const CODIGO_USUARIO_INACTIVO = 'USUARIO_INACTIVO';

/** Cuerpo del 403 de usuario desactivado (login y cualquier petición con sesión). */
export class UsuarioInactivoErrorDto {
  @ApiProperty({ example: 403 })
  statusCode: number;

  @ApiProperty({ example: USUARIO_INACTIVO })
  message: string;

  @ApiProperty({ example: 'Forbidden' })
  error: string;

  @ApiProperty({ example: CODIGO_USUARIO_INACTIVO, description: 'Código estable para que el cliente cierre la sesión' })
  codigo: string;
}

export function usuarioInactivo(): ForbiddenException {
  const cuerpo: UsuarioInactivoErrorDto = {
    statusCode: 403,
    message: USUARIO_INACTIVO,
    error: 'Forbidden',
    codigo: CODIGO_USUARIO_INACTIVO,
  };
  return new ForbiddenException(cuerpo);
}
