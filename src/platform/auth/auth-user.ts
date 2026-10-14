/** Payload firmado en el JWT. */
export interface JwtPayload {
  /** `usuarios.IdUsuario` */
  sub: string;
  usuario: string;
  rol: string;
}

/** Usuario autenticado que `JwtAuthGuard` deja en `request.user`. */
export interface AuthUser {
  id: string;
  usuario: string;
  rol: string;
}

export interface RequestConUsuario {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}
