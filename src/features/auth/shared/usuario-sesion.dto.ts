import { ApiProperty } from '@nestjs/swagger';
import type { UsuarioFila } from '../../../platform/auth/usuarios-login.js';

/** Datos del usuario en sesion (respuesta de login y de `/auth/me`). Nunca incluye la clave. */
export class UsuarioSesionDto {
  @ApiProperty({ example: 'U-001', description: 'IdUsuario' })
  id: string;

  @ApiProperty({ example: 'jperez', description: 'Login del usuario' })
  usuario: string;

  @ApiProperty({ example: 'Juan Pérez', nullable: true, type: String })
  nombres: string | null;

  @ApiProperty({ example: 'Promotor', description: 'Rol vigente del usuario' })
  rol: string;
}

export function toUsuarioSesion(row: UsuarioFila): UsuarioSesionDto {
  return {
    id: String(row.IdUsuario),
    usuario: String(row.Usuario ?? '').trim(),
    nombres: row.Nombres == null ? null : String(row.Nombres),
    rol: String(row.Rol ?? '').trim(),
  };
}
