import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { RequestConUsuario } from './auth-user.js';
import { usuarioActual } from './current-user.decorator.js';
import { jwtModuleOptions } from './jwt.config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class Demo {
  @Public()
  publico() {}

  @Roles('Administrador', 'Supervisor')
  gestion() {}

  @Public()
  @Roles('Administrador')
  publicoConRol() {}

  libre() {}
}

@Roles('Administrador')
class SoloAdmin {
  accion() {}
}

function ctx(
  handler: () => void,
  req: Partial<RequestConUsuario>,
  clase: object = Demo,
): ExecutionContext {
  const request = { headers: {}, ...req };
  return {
    getHandler: () => handler,
    getClass: () => clase,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const demo = Demo.prototype;
const SECRET = 's'.repeat(64);
const jwt = new JwtService(jwtModuleOptions({ JWT_SECRET: SECRET }));
const payload = { sub: 'U-001', usuario: 'jperez', rol: 'Promotor' };

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(jwt, new Reflector());

  afterEach(() => vi.useRealTimers());

  it('acepta un token valido y deja el usuario en request.user', async () => {
    const token = await jwt.signAsync(payload);
    const req: RequestConUsuario = { headers: { authorization: `Bearer ${token}` } };
    const context = ctx(demo.libre, req);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    expect(request.user).toEqual({ id: 'U-001', usuario: 'jperez', rol: 'Promotor' });
  });

  it('rechaza sin token o con esquema distinto de Bearer', async () => {
    await expect(guard.canActivate(ctx(demo.libre, {}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const token = await jwt.signAsync(payload);
    await expect(
      guard.canActivate(ctx(demo.libre, { headers: { authorization: `Basic ${token}` } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const ajeno = new JwtService({ secret: 'x'.repeat(64) });
    const token = await ajeno.signAsync(payload);
    await expect(
      guard.canActivate(ctx(demo.libre, { headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token expirado (vigencia 8 h)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const inicio = new Date('2026-10-14T08:00:00Z');
    vi.setSystemTime(inicio);
    const token = await jwt.signAsync(payload);
    const req = { headers: { authorization: `Bearer ${token}` } };

    vi.setSystemTime(inicio.getTime() + 8 * 3600_000 - 1000);
    await expect(guard.canActivate(ctx(demo.libre, req))).resolves.toBe(true);

    vi.setSystemTime(inicio.getTime() + 8 * 3600_000 + 1000);
    await expect(guard.canActivate(ctx(demo.libre, req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un token sin el payload esperado', async () => {
    const token = await jwt.signAsync({ foo: 'bar' });
    await expect(
      guard.canActivate(ctx(demo.libre, { headers: { authorization: `Bearer ${token}` } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deja pasar sin token las rutas @Public()', async () => {
    await expect(guard.canActivate(ctx(demo.publico, {}))).resolves.toBe(true);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const user = (rol: string) => ({ user: { id: 'U-001', usuario: 'u', rol } });

  it('sin @Roles deja pasar', () => {
    expect(guard.canActivate(ctx(demo.libre, user('Promotor')))).toBe(true);
  });

  it('permite los roles indicados', () => {
    expect(guard.canActivate(ctx(demo.gestion, user('Supervisor')))).toBe(true);
    expect(guard.canActivate(ctx(demo.gestion, user('Administrador')))).toBe(true);
  });

  it('responde 403 con otro rol', () => {
    expect(() => guard.canActivate(ctx(demo.gestion, user('Promotor')))).toThrow(
      ForbiddenException,
    );
  });

  it('responde 401 si no hay usuario autenticado', () => {
    expect(() => guard.canActivate(ctx(demo.gestion, {}))).toThrow(UnauthorizedException);
  });

  it('respeta @Roles a nivel de controller', () => {
    const accion = SoloAdmin.prototype.accion;
    expect(guard.canActivate(ctx(accion, user('Administrador'), SoloAdmin))).toBe(true);
    expect(() => guard.canActivate(ctx(accion, user('Usuario'), SoloAdmin))).toThrow(
      ForbiddenException,
    );
  });

  it('@Public() tiene prioridad', () => {
    expect(guard.canActivate(ctx(demo.publicoConRol, {}))).toBe(true);
  });
});

describe('@CurrentUser()', () => {
  it('devuelve el usuario o uno de sus campos', () => {
    const u = { id: 'U-001', usuario: 'jperez', rol: 'Promotor' };
    const context = ctx(demo.libre, { user: u });
    expect(usuarioActual(undefined, context)).toEqual(u);
    expect(usuarioActual('rol', context)).toBe('Promotor');
    expect(usuarioActual(undefined, ctx(demo.libre, {}))).toBeUndefined();
  });
});
