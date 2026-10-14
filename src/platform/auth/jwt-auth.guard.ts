import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload, RequestConUsuario } from './auth-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

export const SESION_INVALIDA = 'Sesión inválida o expirada';

function extraerBearer(req: RequestConUsuario): string | undefined {
  const header = req.headers['authorization'];
  const valor = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(valor ?? '');
  return match?.[1];
}

function esPayload(valor: unknown): valor is JwtPayload {
  if (!valor || typeof valor !== 'object') return false;
  const p = valor as Record<string, unknown>;
  return (
    typeof p['sub'] === 'string' &&
    p['sub'].length > 0 &&
    typeof p['usuario'] === 'string' &&
    typeof p['rol'] === 'string'
  );
}

/**
 * Exige `Authorization: Bearer <jwt>` valido (HS256, no expirado) y deja el
 * usuario en `request.user`. Respeta `@Public()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestConUsuario>();
    const token = extraerBearer(req);
    if (!token) throw new UnauthorizedException(SESION_INVALIDA);

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException(SESION_INVALIDA);
    }
    if (!esPayload(payload)) throw new UnauthorizedException(SESION_INVALIDA);

    req.user = { id: payload.sub, usuario: payload.usuario, rol: payload.rol };
    return true;
  }
}
