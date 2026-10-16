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
import { SesionUsuariosService } from './sesion-usuarios.js';
import { usuarioInactivo } from './usuario-inactivo.js';

export const SESION_INVALIDA = 'Sesión inválida o expirada';

function extraerBearer(req: RequestConUsuario): string | undefined {
  const header = req.headers['authorization'];
  const valor = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(valor ?? '');
  return match?.[1];
}

function esPayload(valor: unknown): valor is JwtPayload {
  if (!valor || typeof valor !== 'object') return false;
  return (
    'sub' in valor &&
    typeof valor.sub === 'string' &&
    valor.sub.length > 0 &&
    'usuario' in valor &&
    typeof valor.usuario === 'string' &&
    'rol' in valor &&
    typeof valor.rol === 'string'
  );
}

/**
 * Exige `Authorization: Bearer <jwt>` valido (HS256, no expirado) y deja el
 * usuario en `request.user`. Respeta `@Public()`.
 *
 * Ademas valida contra la BD (cache ~10 s, `SesionUsuariosService`) que el usuario
 * exista (si no, 401) y este activo (si no, 403 `USUARIO_INACTIVO`), y usa el ROL
 * DE LA BD, no el del token: un cambio de rol se aplica sin volver a entrar.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly sesiones: SesionUsuariosService,
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

    const enBd = await this.sesiones.obtener(payload.sub);
    if (!enBd) throw new UnauthorizedException(SESION_INVALIDA);
    if (!enBd.activo) throw usuarioInactivo();

    req.user = { id: payload.sub, usuario: payload.usuario, rol: enBd.rol };
    return true;
  }
}
