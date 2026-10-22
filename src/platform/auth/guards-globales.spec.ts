import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from '../../app.controller.js';
import { EmpresaController } from '../../features/administration/empresa/empresa.controller.js';
import { RolController } from '../../features/administration/rol/rol.controller.js';
import { UsuarioController } from '../../features/administration/usuario/usuario.controller.js';
import { LoginController } from '../../features/auth/login/login.controller.js';
import { MeController } from '../../features/auth/me/me.controller.js';
import { MisPermisosController } from '../../features/auth/mis-permisos/mis-permisos.controller.js';
import { CatalogoPermisosController } from '../../features/administration/permisos/catalogo/catalogo.controller.js';
import { MatrizPermisosController } from '../../features/administration/permisos/matriz/matriz.controller.js';
import { DB, PrismaModule } from '../../prisma/prisma.module.js';
import { AuditoriaPermisosService } from './auditoria-permisos.js';
import type { AuthUser } from './auth-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LECTURA_COMPARTIDA_KEY, LecturaCompartida, MODULO_KEY, Modulo } from './permisos.decorator.js';
import { PermisosGuard } from './permisos.guard.js';
import { GUARDS_GLOBALES, PlatformAuthModule } from './platform-auth.module.js';
import { IS_PUBLIC_KEY, Public } from './public.decorator.js';
import { ROL_ADMINISTRADOR } from './roles.js';

@Controller('prueba')
@Modulo('admin.usuarios')
class PruebaController {
  @Public()
  @Get('publico')
  publico() {
    return { ok: true };
  }

  @LecturaCompartida()
  @Get('privado')
  privado(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Get('admin')
  admin() {
    return { admin: true };
  }
}

const SECRET = 'x'.repeat(48);

/** Usuarios de la BD (los lee `JwtAuthGuard`): el `sub` del token elige la fila. */
const USUARIOS_BD: Record<string, { IdUsuario: string; Rol: string; activo: boolean }> = {
  U1: { IdUsuario: 'U1', Rol: 'Usuario', activo: true },
  ADM: { IdUsuario: 'ADM', Rol: 'Administrador', activo: true },
  INACTIVO: { IdUsuario: 'INACTIVO', Rol: 'Administrador', activo: false },
};

const ROLES_BD = [
  { id: 1, nombre: 'Administrador', es_sistema: true },
  { id: 2, nombre: 'Usuario', es_sistema: false },
];
const MODULOS_BD = [
  {
    id: 32,
    clave: 'admin.usuarios',
    nombre: 'Usuarios',
    grupo: 'Administración',
    ruta: '/admin/usuarios',
    orden: 32,
    admite_aprobar: false,
    admite_anular: false,
    activo: true,
  },
];

@Module({
  providers: [
    {
      provide: DB,
      useValue: {
        orm: {
          public: {
            Usuarios: {
              first: async ({ IdUsuario }: { IdUsuario: string }) => USUARIOS_BD[IdUsuario] ?? null,
            },
            rol: { first: async ({ nombre }: { nombre: string }) => ROLES_BD.find((r) => r.nombre === nombre) ?? null },
            modulo: { orderBy: () => ({ all: async () => MODULOS_BD }) },
            // "Usuario" no tiene filas: sin permisos en ningún módulo.
            rol_permiso: { where: () => ({ all: async () => [] }) },
            // Sin excepciones por usuario ni módulos por área (plan 08).
            usuario_permiso: { where: () => ({ all: async () => [] }) },
            area_modulo: { where: () => ({ all: async () => [] }) },
          },
        },
      },
    },
  ],
  exports: [DB],
})
class FakePrismaModule {}

describe('guards globales (toda la API exige sesión)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const secretAnterior = process.env['JWT_SECRET'];

  /** El rol del token se ignora: manda el de la BD (fila elegida por `sub`). */
  const SUB_POR_ROL: Record<string, string> = { Usuario: 'U1', Administrador: 'ADM' };
  const token = (rol: string, opciones: { expiresIn?: number; sub?: string } = {}) =>
    jwt.sign(
      { sub: opciones.sub ?? SUB_POR_ROL[rol] ?? 'U1', usuario: 'u1', rol },
      { expiresIn: opciones.expiresIn ?? 3600 },
    );
  const get = (url: string, t?: string) => {
    const r = request(app.getHttpServer()).get(url);
    return t ? r.set('Authorization', `Bearer ${t}`) : r;
  };

  beforeAll(async () => {
    process.env['JWT_SECRET'] = SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [PlatformAuthModule],
      controllers: [PruebaController],
    })
      .overrideModule(PrismaModule)
      .useModule(FakePrismaModule)
      // No escribir en logs/ del proyecto durante los tests.
      .overrideProvider(AuditoriaPermisosService)
      .useValue({ registrar: () => undefined, archivo: '' })
      .compile();
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

  it('PermisosGuard: sin permiso en Administración → 403 SIN_PERMISO (estricto aun en auditoría); Administrador pasa', async () => {
    const res = await get('/prueba/admin', token('Usuario')).expect(403);
    expect(res.body).toEqual({
      statusCode: 403,
      message: 'No tienes permiso para ver en Usuarios',
      error: 'Forbidden',
      codigo: 'SIN_PERMISO',
      modulo: 'admin.usuarios',
      accion: 'ver',
    });
    await get('/prueba/admin', token('Administrador')).expect(200, { admin: true });
  });

  it('los guards globales son JwtAuthGuard y luego PermisosGuard (RolesGuard retirado)', () => {
    expect(GUARDS_GLOBALES).toEqual([
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: PermisosGuard },
    ]);
  });

  it('el rol sale de la BD: un token que dice Administrador con usuario Usuario recibe 403', async () => {
    await get('/prueba/admin', token('Administrador', { sub: 'U1' })).expect(403);
    const res = await get('/prueba/privado', token('Administrador', { sub: 'U1' })).expect(200);
    expect(res.body.rol).toBe('Usuario');
  });

  it('usuario borrado → 401; usuario inactivo → 403 USUARIO_INACTIVO en cualquier ruta con sesión', async () => {
    await get('/prueba/privado', token('Usuario', { sub: 'BORRADO' })).expect(401);
    const res = await get('/prueba/privado', token('Administrador', { sub: 'INACTIVO' })).expect(403);
    expect(res.body).toEqual({
      statusCode: 403,
      message: 'Tu usuario está desactivado. Contacta al administrador',
      error: 'Forbidden',
      codigo: 'USUARIO_INACTIVO',
    });
    await get('/prueba/admin', token('Administrador', { sub: 'INACTIVO' })).expect(403);
    await get('/prueba/publico', token('Administrador', { sub: 'INACTIVO' })).expect(200);
  });
});

describe('permisos declarados en los controladores', () => {
  const publico = (target: object) => Reflect.getMetadata(IS_PUBLIC_KEY, target) === true;
  const compartida = (target: object) => Reflect.getMetadata(LECTURA_COMPARTIDA_KEY, target) === true;
  const modulo = (target: object): unknown => Reflect.getMetadata(MODULO_KEY, target);
  const handler = (clase: { prototype: object }, metodo: string) =>
    (clase.prototype as Record<string, object>)[metodo];
  const metodos = (clase: { prototype: object }) =>
    Object.getOwnPropertyNames(clase.prototype).filter((m) => m !== 'constructor');

  it('login y health son públicos; /auth/me y /auth/mis-permisos solo exigen sesión', () => {
    expect(publico(LoginController)).toBe(true);
    expect(publico(handler(AppController, 'getHello'))).toBe(true);
    for (const clase of [MeController, MisPermisosController]) {
      expect(publico(clase)).toBe(false);
      expect(compartida(clase)).toBe(true);
      for (const m of metodos(clase)) expect(publico(handler(clase, m))).toBe(false);
    }
  });

  it('ROL_ADMINISTRADOR es el nombre del rol del sistema', () => {
    expect(ROL_ADMINISTRADOR).toBe('Administrador');
  });

  it('usuarios, roles, catálogo y matriz de permisos: módulo de Administración y ningún método lo relaja', () => {
    for (const [clase, clave] of [
      [UsuarioController, 'admin.usuarios'],
      [RolController, 'admin.roles'],
      [CatalogoPermisosController, 'admin.roles'],
      [MatrizPermisosController, 'admin.roles'],
    ] as const) {
      expect(modulo(clase)).toBe(clave);
      expect(publico(clase)).toBe(false);
      expect(compartida(clase)).toBe(false);
      for (const m of metodos(clase)) {
        expect(publico(handler(clase, m))).toBe(false);
        expect(compartida(handler(clase, m))).toBe(false);
      }
    }
    expect(metodos(RolController).length).toBe(4);
  });

  it('empresas: leer es lectura compartida (selects); crear, editar y eliminar exigen permiso en admin.empresas', () => {
    expect(modulo(EmpresaController)).toBe('admin.empresas');
    const todos = metodos(EmpresaController);
    const lecturas = todos.filter((m) => compartida(handler(EmpresaController, m)));
    expect(lecturas.length).toBe(todos.length - 3);
    expect(lecturas.length).toBeGreaterThanOrEqual(2); // listar y ver detalle
  });
});
