import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestConUsuario } from './auth-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';
import type { Rol } from './roles.js';

/**
 * Evalua `@Roles(...)`. Debe correr despues de `JwtAuthGuard` (usa
 * `request.user`). Sin `@Roles` o con `@Public()` deja pasar.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) {
      return true;
    }
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<RequestConUsuario>().user;
    if (!user) throw new UnauthorizedException();
    if (!(roles as string[]).includes(user.rol)) {
      throw new ForbiddenException('No tiene permisos para esta operación');
    }
    return true;
  }
}
