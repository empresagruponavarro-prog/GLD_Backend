import { ApiProperty } from '@nestjs/swagger';
import type { UsuarioFila } from '../../../platform/auth/usuarios/usuarios-login.js';
import type { Database } from '../../../prisma/prisma.module.js';

/** Área del usuario en sesión (se muestra junto a su rol y decide qué módulos y datos ve). */
export class AreaSesionDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'PROCURA' })
  codigo: string;

  @ApiProperty({ example: 'Procura' })
  nombre: string;
}

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

  @ApiProperty({ type: AreaSesionDto, nullable: true, description: 'Área asignada (null = sin área: alcance global)' })
  area: AreaSesionDto | null;
}

export function toUsuarioSesion(row: UsuarioFila, area: AreaSesionDto | null): UsuarioSesionDto {
  return {
    id: String(row.IdUsuario),
    usuario: String(row.Usuario ?? '').trim(),
    nombres: row.Nombres == null ? null : String(row.Nombres),
    rol: String(row.Rol ?? '').trim(),
    area,
  };
}

/** Área de la sesión leída de la BD; `null` si el usuario no tiene área o ya no existe. */
export async function areaDeSesion(db: Pick<Database, 'orm'>, idArea: number | null): Promise<AreaSesionDto | null> {
  if (idArea === null) return null;
  const area = await db.orm.public.area.first({ id: idArea });
  return area ? { id: area.id, codigo: area.codigo, nombre: area.nombre } : null;
}
