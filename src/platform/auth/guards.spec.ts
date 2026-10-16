import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Database } from '../../prisma/prisma.module.js';
import type { RequestConUsuario } from './auth-user.js';
import { usuarioActual } from './current-user.decorator.js';
import { jwtModuleOptions } from './jwt.config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';
import { SESION_CACHE_MS, SesionUsuariosService } from './sesion-usuarios.js';
import { CODIGO_USUARIO_INACTIVO, USUARIO_INACTIVO } from './usuario-inactivo.js';

class Demo {
  @Public()
  publico() {}

  libre() {}
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

/** `usuarios` en memoria: lo que `SesionUsuariosService` lee con `Usuarios.first({ IdUsuario })`. */
const usuariosBd = new Map<string, { IdUsuario: string; Rol: string | null; activo: boolean }>();
const usuariosFirst = vi.fn(
  async ({ IdUsuario }: { IdUsuario: string }) => usuariosBd.get(IdUsuario) ?? null,
);
const dbFalsa = { orm: { public: { Usuarios: { first: usuariosFirst } } } } as unknown as Database;

describe('JwtAuthGuard', () => {
  let sesiones: SesionUsuariosService;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    usuariosBd.clear();
    usuariosBd.set('U-001', { IdUsuario: 'U-001', Rol: 'Promotor', activo: true });
    usuariosFirst.mockClear();
    sesiones = new SesionUsuariosService(dbFalsa);
    guard = new JwtAuthGuard(jwt, new Reflector(), sesiones);
  });

  afterEach(() => vi.useRealTimers());

  const conToken = async (sub = 'U-001'): Promise<RequestConUsuario> => ({
    headers: { authorization: `Bearer ${await jwt.signAsync({ ...payload, sub })}` },
  });
  /** Ejecuta el guard y devuelve el `request.user` que dejó. */
  const usuarioTras = async (req: RequestConUsuario) => {
    const context = ctx(demo.libre, req);
    await guard.canActivate(context);
    return context.switchToHttp().getRequest<RequestConUsuario>().user;
  };

  it('acepta un token valido y deja el usuario en request.user', async () => {
    const token = await jwt.signAsync(payload);
    const req: RequestConUsuario = { headers: { authorization: `Bearer ${token}` } };
    const context = ctx(demo.libre, req);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    expect(request.user).toEqual({ id: 'U-001', usuario: 'jperez', rol: 'Promotor' });
    expect(usuariosFirst).toHaveBeenCalledWith({ IdUsuario: 'U-001' });
  });

  it('usa el rol de la BD, no el del token (un cambio de rol se aplica sin volver a entrar)', async () => {
    usuariosBd.set('U-001', { IdUsuario: 'U-001', Rol: '  Supervisor ', activo: true });
    const req = await conToken();
    await expect(usuarioTras(req)).resolves.toEqual({ id: 'U-001', usuario: 'jperez', rol: 'Supervisor' });
  });

  it("un usuario sin rol en la BD queda con rol ''", async () => {
    usuariosBd.set('U-001', { IdUsuario: 'U-001', Rol: null, activo: true });
    const req = await conToken();
    expect((await usuarioTras(req))?.rol).toBe('');
  });

  it('usuario borrado (token valido) → 401 Sesión inválida o expirada', async () => {
    const error = await guard
      .canActivate(ctx(demo.libre, await conToken('U-999')))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe('Sesión inválida o expirada');
  });

  it('usuario inactivo → 403 con codigo USUARIO_INACTIVO', async () => {
    usuariosBd.set('U-001', { IdUsuario: 'U-001', Rol: 'Promotor', activo: false });
    const req = await conToken();
    const context = ctx(demo.libre, req);
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      statusCode: 403,
      message: 'Tu usuario está desactivado. Contacta al administrador',
      error: 'Forbidden',
      codigo: 'USUARIO_INACTIVO',
    });
    expect([USUARIO_INACTIVO, CODIGO_USUARIO_INACTIVO]).toEqual([
      'Tu usuario está desactivado. Contacta al administrador',
      'USUARIO_INACTIVO',
    ]);
    expect(context.switchToHttp().getRequest<RequestConUsuario>().user).toBeUndefined();
  });

  it('cachea por sub ~10 s y luego vuelve a leer la BD', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
    const req = await conToken();
    await guard.canActivate(ctx(demo.libre, req));
    await guard.canActivate(ctx(demo.libre, req));
    expect(usuariosFirst).toHaveBeenCalledTimes(1);

    // Dentro de la ventana un cambio hecho por fuera (sin invalidar) aún no se ve...
    usuariosBd.set('U-001', { IdUsuario: 'U-001', Rol: 'Promotor', activo: false });
    vi.setSystemTime(Date.now() + SESION_CACHE_MS - 1);
    await expect(guard.canActivate(ctx(demo.libre, req))).resolves.toBe(true);

    // ...y al vencer la caché se aplica.
    vi.setSystemTime(Date.now() + 2);
    await expect(guard.canActivate(ctx(demo.libre, req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(usuariosFirst).toHaveBeenCalledTimes(2);
    expect(SESION_CACHE_MS).toBe(10_000);
  });

  it('invalidar(id) / invalidarTodo() aplican de inmediato estado, rol y borrado', async () => {
    const req = await conToken();
    await guard.canActivate(ctx(demo.libre, req));

    usuariosBd.set('U-001', { IdUsuario: 'U-001', Rol: 'Usuario', activo: true });
    sesiones.invalidar('U-001');
    expect((await usuarioTras(req))?.rol).toBe('Usuario');

    usuariosBd.set('U-001', { IdUsuario: 'U-001', Rol: 'Usuario', activo: false });
    sesiones.invalidar('U-001');
    await expect(guard.canActivate(ctx(demo.libre, req))).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    usuariosBd.delete('U-001');
    sesiones.invalidarTodo();
    await expect(guard.canActivate(ctx(demo.libre, req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usuariosFirst).toHaveBeenCalledTimes(4);
  });

  it('una lectura en curso al invalidar no deja en la caché el valor viejo', async () => {
    let liberar: () => void = () => undefined;
    usuariosFirst.mockImplementationOnce(({ IdUsuario }: { IdUsuario: string }) => {
      const viejo = usuariosBd.get(IdUsuario) ?? null;
      return new Promise((resolve) => {
        liberar = () => resolve(viejo);
      });
    });
    const enCurso = sesiones.obtener('U-001');
    usuariosBd.set('U-001', { IdUsuario: 'U-001', Rol: 'Promotor', activo: false });
    sesiones.invalidar('U-001');
    liberar();
    await expect(enCurso).resolves.toEqual({ activo: true, rol: 'Promotor' });
    await expect(sesiones.obtener('U-001')).resolves.toEqual({ activo: false, rol: 'Promotor' });
    expect(usuariosFirst).toHaveBeenCalledTimes(2);
  });

  it('sin token valido no consulta la BD', async () => {
    await expect(guard.canActivate(ctx(demo.libre, {}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usuariosFirst).not.toHaveBeenCalled();
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

describe('@CurrentUser()', () => {
  it('devuelve el usuario o uno de sus campos', () => {
    const u = { id: 'U-001', usuario: 'jperez', rol: 'Promotor' };
    const context = ctx(demo.libre, { user: u });
    expect(usuarioActual(undefined, context)).toEqual(u);
    expect(usuarioActual('rol', context)).toBe('Promotor');
    expect(usuarioActual(undefined, ctx(demo.libre, {}))).toBeUndefined();
  });
});
