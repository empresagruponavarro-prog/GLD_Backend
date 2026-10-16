// Solo imports de tipo: este archivo tambien lo cargan los scripts de
// `scripts/` con el type-stripping de Node (sin compilar).
import type { Database } from '../../prisma/prisma.module.js';

/** Fila de `usuarios` (las columnas varchar llegan como string). */
export interface UsuarioFila {
  IdUsuario: string;
  Nombres: string | null;
  Usuario: string | null;
  Clave: string | null;
  Rol: string | null;
  /** Usuario desactivado: no puede iniciar sesion (plan 05-roles, D6). */
  activo: boolean;
}

/** Login normalizado: sin espacios extremos y en minusculas. */
export function normalizarLogin(valor: string | null | undefined): string {
  return (valor ?? '').trim().toLowerCase();
}

function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Usuarios cuyo login coincide con `login` sin distinguir mayusculas ni
 * espacios extremos. La columna no es unica en la BD (datos heredados), por
 * eso devuelve una lista. ILIKE preselecciona en la BD y la comparacion exacta
 * se hace aqui (tolera espacios guardados alrededor del login).
 */
export async function buscarUsuariosPorLogin(
  db: Pick<Database, 'orm'>,
  login: string,
): Promise<UsuarioFila[]> {
  const buscado = normalizarLogin(login);
  if (!buscado) return [];
  const candidatos: UsuarioFila[] = await db.orm.public.Usuarios.where((u) =>
    u.Usuario.ilike(`%${escaparLike(login.trim())}%`),
  ).all();
  return candidatos.filter((u) => normalizarLogin(u.Usuario) === buscado);
}
