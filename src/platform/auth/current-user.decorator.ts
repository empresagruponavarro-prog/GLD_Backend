import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser, RequestConUsuario } from './auth-user.js';

export function usuarioActual(
  campo: keyof AuthUser | undefined,
  ctx: ExecutionContext,
): AuthUser | string | undefined {
  const user = ctx.switchToHttp().getRequest<RequestConUsuario>().user;
  return campo ? user?.[campo] : user;
}

/**
 * Usuario autenticado (`request.user`, lo deja `JwtAuthGuard`).
 * `@CurrentUser() user: AuthUser` o `@CurrentUser('id') id: string`.
 */
export const CurrentUser = createParamDecorator(usuarioActual);
