import { Controller, Get, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../../app.controller.js';
import { EmpresaController } from '../../features/administration/empresa/empresa.controller.js';
import { RolController } from '../../features/administration/rol/rol.controller.js';
import { UsuarioController } from '../../features/administration/usuario/usuario.controller.js';
import { LoginController } from '../../features/auth/login/login.controller.js';
import { MeController } from '../../features/auth/me/me.controller.js';
import type { AuthUser } from './auth-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { PlatformAuthModule } from './platform-auth.module.js';
import { IS_PUBLIC_KEY, Public } from './public.decorator.js';
import { ROLES_KEY, Roles } from './roles.decorator.js';
import { ROL_ADMINISTRADOR } from './roles.js';

@Controller('prueba')
class PruebaController {
  @Public()
  @Get('publico')
  publico() {
    return { ok: true };
  }

  @Get('privado')
  privado(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles('Administrador')
  @Get('admin')
  admin() {
    return { admin: true };
  }
}

const SECRET = 'x'.repeat(48);

describe('guards globales (toda la API exige sesión)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const secretAnterior = process.env['JWT_SECRET'];

  const token = (rol: string, opciones: { expiresIn?: number } = {}) =>
    jwt.sign({ sub: 'U1', usuario: 'u1', rol }, { expiresIn: opciones.expiresIn ?? 3600 });
  const get = (url: string, t?: string) => {
    const r = request(app.getHttpServer()).get(url);
    return t ? r.set('Authorization', `Bearer ${t}`) : r;
  };

  beforeAll(async () => {
    process.env['JWT_SECRET'] = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [PlatformAuthModule],
      controllers: [PruebaController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
    if (secretAnterior === undefined) delete process.env['JWT_SECRET'];
    else process.env['JWT_SECRET'] = secretAnterior;
  });

  it('una ruta @Public responde sin token', async () => {
    await get('/prueba/publico').expect(200, { ok: true });
  });

  it('sin token responde 401', async () => {
    const res = await get('/prueba/privado').expect(401);
    expect(res.body.message).toBe('Sesión inválida o expirada');
  });

  it.each([
    ['basura', 'no-es-un-jwt'],
    ['firmado con otro secreto', new JwtService({ secret: 'y'.repeat(48) }).sign({ sub: 'U1', usuario: 'u1', rol: 'Administrador' })],
  ])('token %s → 401', async (_caso, t) => {
    await get('/prueba/privado', t).expect(401);
  });

  it('token vencido → 401', async () => {
    await get('/prueba/privado', token('Administrador', { expiresIn: -10 })).expect(401);
  });

  it('con token válido deja pasar y expone el usuario', async () => {
    const res = await get('/prueba/privado', token('Usuario')).expect(200);
    expect(res.body).toEqual({ id: 'U1', usuario: 'u1', rol: 'Usuario' });
  });

  it('@Roles: un rol distinto recibe 403 y Administrador pasa', async () => {
    const res = await get('/prueba/admin', token('Usuario')).expect(403);
    expect(res.body.message).toBe('No tiene permisos para esta operación');
    await get('/prueba/admin', token('Administrador')).expect(200, { admin: true });
  });
});

describe('permisos declarados en los controladores', () => {
  const publico = (target: object) => Reflect.getMetadata(IS_PUBLIC_KEY, target) === true;
  const roles = (target: object) => Reflect.getMetadata(ROLES_KEY, target) as string[] | undefined;
  const handler = (clase: { prototype: object }, metodo: string) =>
    (clase.prototype as Record<string, object>)[metodo];

  it('login y health son públicos; /auth/me no', () => {
    expect(publico(LoginController)).toBe(true);
    expect(publico(handler(AppController, 'getHello'))).toBe(true);
    expect(publico(MeController)).toBe(false);
    expect(publico(handler(MeController, 'me'))).toBe(false);
  });

  it('ROL_ADMINISTRADOR es el nombre del rol del sistema', () => {
    expect(ROL_ADMINISTRADOR).toBe('Administrador');
  });

  it('todo /administration/usuarios exige Administrador', () => {
    expect(roles(UsuarioController)).toEqual(['Administrador']);
  });

  it('todo /administration/roles exige Administrador y ningún método lo relaja', () => {
    expect(roles(RolController)).toEqual(['Administrador']);
    const metodos = Object.getOwnPropertyNames(RolController.prototype).filter((m) => m !== 'constructor');
    expect(metodos.length).toBe(4);
    for (const m of metodos) {
      expect(publico(handler(RolController, m))).toBe(false);
      expect(roles(handler(RolController, m))).toBeUndefined();
    }
  });

  it('empresas: leer es para cualquier sesión; crear, editar y eliminar exigen Administrador', () => {
    const metodos = Object.getOwnPropertyNames(EmpresaController.prototype).filter((m) => m !== 'constructor');
    const conRol = metodos.filter((m) => roles(handler(EmpresaController, m))?.includes('Administrador'));
    const sinRol = metodos.filter((m) => !roles(handler(EmpresaController, m)));

    expect(roles(EmpresaController)).toBeUndefined();
    expect(conRol.length).toBe(3);
    expect(sinRol.length).toBe(metodos.length - 3);
    expect(sinRol.length).toBeGreaterThanOrEqual(2); // listar y ver detalle
  });
});
