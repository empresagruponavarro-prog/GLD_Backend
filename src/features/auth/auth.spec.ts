import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { hashClave } from '../../platform/auth/passwords.js';
import { CLAVES_MODULO } from '../../platform/auth/permisos.js';
import { DB, PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from './auth.module.js';

const SECRET = 'k'.repeat(64);
const CLAVE = 'secreta123';
const OCHO_HORAS = 8 * 3600;

const where = vi.fn();
const first = vi.fn();
const usuarios = { where, first };

/** Catálogo y permisos en memoria para /auth/mis-permisos. */
const ROLES = [
  { id: 1, nombre: 'Administrador', es_sistema: true },
  { id: 2, nombre: 'Promotor', es_sistema: false },
  { id: 3, nombre: 'Sin Permisos', es_sistema: false },
];
const MODULOS = [
  { id: 1, clave: 'dashboard', nombre: 'Dashboard', grupo: 'Navegación', ruta: '/d', orden: 1, admite_aprobar: false, admite_anular: false, activo: true },
  { id: 4, clave: 'documentos.administracion', nombre: 'Compromisos', grupo: 'Documentos', ruta: '/da', orden: 4, admite_aprobar: true, admite_anular: true, activo: true },
  { id: 10, clave: 'tesoreria.pagos', nombre: 'Pagos', grupo: 'Tesorería', ruta: '/tp', orden: 10, admite_aprobar: false, admite_anular: true, activo: true },
  { id: 33, clave: 'admin.roles', nombre: 'Roles', grupo: 'Administración', ruta: '/ar', orden: 33, admite_aprobar: false, admite_anular: false, activo: false },
];
const AREAS = [{ id: 7, codigo: 'PROCURA', nombre: 'Procura' }];
const PERMISOS = [
  { rol_id: 2, modulo_id: 1, ver: true, crear: false, editar: false, eliminar: false, aprobar: false, anular: false },
  { rol_id: 2, modulo_id: 10, ver: true, crear: true, editar: true, eliminar: false, aprobar: false, anular: true },
  // Fila de un módulo inactivo: no cuenta.
  { rol_id: 2, modulo_id: 33, ver: true, crear: true, editar: true, eliminar: true, aprobar: false, anular: false },
];
const orm = {
  Usuarios: usuarios,
  rol: {
    first: async ({ nombre }: { nombre: string }) => ROLES.find((r) => r.nombre === nombre) ?? null,
  },
  modulo: {
    where: ({ activo }: { activo: boolean }) => ({
      orderBy: () => ({ all: async () => MODULOS.filter((m) => m.activo === activo) }),
    }),
    orderBy: () => ({ all: async () => MODULOS }),
  },
  rol_permiso: {
    where: ({ rol_id }: { rol_id: number }) => ({
      all: async () => PERMISOS.filter((p) => p.rol_id === rol_id),
    }),
  },
  // Sin excepciones por usuario ni módulos por área (plan 08).
  usuario_permiso: { where: () => ({ all: async () => [] }) },
  area_modulo: { where: () => ({ all: async () => [] }) },
  area: { first: async ({ id }: { id: number }) => AREAS.find((a) => a.id === id) ?? null },
};

@Module({
  providers: [{ provide: DB, useValue: { orm: { public: orm } } }],
  exports: [DB],
})
class FakePrismaModule {}

let hashGuardado: string;

function fila(over: Partial<Record<string, string | boolean | null>> = {}) {
  return {
    IdUsuario: 'U-001',
    Nombres: 'Juan Pérez',
    Usuario: 'jperez',
    Clave: hashGuardado,
    Rol: 'Promotor',
    activo: true,
    id_area: null,
    ...over,
  };
}

/** Simula `Usuarios.where(cb).all()` (preseleccion ILIKE). */
function candidatos(rows: unknown[]) {
  where.mockImplementation(() => ({ all: vi.fn().mockResolvedValue(rows) }));
}

describe('auth (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let secretPrevio: string | undefined;

  beforeAll(async () => {
    secretPrevio = process.env['JWT_SECRET'];
    process.env['JWT_SECRET'] = SECRET;
    hashGuardado = await hashClave(CLAVE);
  });

  afterAll(() => {
    process.env['JWT_SECRET'] = secretPrevio;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    where.mockReset();
    first.mockReset();
    const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideModule(PrismaModule)
      .useModule(FakePrismaModule)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  const login = (body: object) => request(app.getHttpServer()).post('/auth/login').send(body);
  const me = (token?: string) => {
    const req = request(app.getHttpServer()).get('/auth/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const CREDENCIALES_401 = {
    statusCode: 401,
    message: 'Usuario o contraseña incorrectos',
    error: 'Unauthorized',
  };

  describe('POST /auth/login', () => {
    it('200 con el área del usuario cuando tiene una asignada', async () => {
      candidatos([fila({ id_area: 7 })]);
      const res = await login({ usuario: 'jperez', clave: CLAVE }).expect(200);
      expect(res.body.usuario.area).toEqual({ id: 7, codigo: 'PROCURA', nombre: 'Procura' });
    });

    it('200 con token, expiraEn y usuario (sin clave)', async () => {
      candidatos([fila()]);
      const res = await login({ usuario: 'jperez', clave: CLAVE }).expect(200);

      expect(Object.keys(res.body).sort()).toEqual(['expiraEn', 'token', 'usuario']);
      expect(res.body.usuario).toEqual({
        id: 'U-001',
        usuario: 'jperez',
        nombres: 'Juan Pérez',
        rol: 'Promotor',
        area: null,
      });
      expect(JSON.stringify(res.body)).not.toContain(hashGuardado);

      const decoded = jwt.decode(res.body.token, { complete: true }) as {
        header: { alg: string };
        payload: { sub: string; usuario: string; rol: string; iat: number; exp: number };
      };
      expect(decoded.header.alg).toBe('HS256');
      expect(decoded.payload).toMatchObject({ sub: 'U-001', usuario: 'jperez', rol: 'Promotor' });
      expect(decoded.payload.exp - decoded.payload.iat).toBe(OCHO_HORAS);
      expect(res.body.expiraEn).toBe(new Date(decoded.payload.exp * 1000).toISOString());
      await expect(jwt.verifyAsync(res.body.token, { secret: SECRET })).resolves.toBeTruthy();
    });

    it('compara el usuario con trim y sin distinguir mayusculas', async () => {
      candidatos([fila({ Usuario: 'JPerez' })]);
      await login({ usuario: '  jPEREZ ', clave: CLAVE }).expect(200);
    });

    it('401 con clave incorrecta', async () => {
      candidatos([fila()]);
      const res = await login({ usuario: 'jperez', clave: 'otra-clave' }).expect(401);
      expect(res.body).toEqual(CREDENCIALES_401);
    });

    it('401 con el mismo mensaje si el usuario no existe', async () => {
      candidatos([]);
      const res = await login({ usuario: 'nadie', clave: CLAVE }).expect(401);
      expect(res.body).toEqual(CREDENCIALES_401);
    });

    it('401 si la clave guardada esta en texto plano (aunque coincida)', async () => {
      candidatos([fila({ Clave: CLAVE })]);
      const res = await login({ usuario: 'jperez', clave: CLAVE }).expect(401);
      expect(res.body).toEqual(CREDENCIALES_401);
    });

    it('401 si el usuario no tiene clave', async () => {
      candidatos([fila({ Clave: null })]);
      await login({ usuario: 'jperez', clave: CLAVE }).expect(401);
    });

    it('403 USUARIO_INACTIVO si el usuario está desactivado y la clave es correcta (sin token)', async () => {
      candidatos([fila({ activo: false })]);
      const res = await login({ usuario: 'jperez', clave: CLAVE }).expect(403);
      expect(res.body).toEqual({
        statusCode: 403,
        message: 'Tu usuario está desactivado. Contacta al administrador',
        error: 'Forbidden',
        codigo: 'USUARIO_INACTIVO',
      });
      expect(res.body).not.toHaveProperty('token');
    });

    it('usuario desactivado con clave incorrecta: sigue el 401 genérico (no se revela el estado)', async () => {
      candidatos([fila({ activo: false })]);
      const res = await login({ usuario: 'jperez', clave: 'otra-clave' }).expect(401);
      expect(res.body).toEqual(CREDENCIALES_401);
    });

    it('401 si el login es ambiguo (varios usuarios con el mismo login)', async () => {
      candidatos([fila(), fila({ IdUsuario: 'U-002', Usuario: 'JPEREZ' })]);
      await login({ usuario: 'jperez', clave: CLAVE }).expect(401);
    });

    it.each([
      [{}],
      [{ usuario: 'jperez' }],
      [{ clave: CLAVE }],
      [{ usuario: '', clave: CLAVE }],
      [{ usuario: 'jperez', clave: '' }],
      [{ usuario: 123, clave: CLAVE }],
      [{ usuario: 'u'.repeat(256), clave: CLAVE }],
      [{ usuario: 'jperez', clave: 'c'.repeat(256) }],
    ])('400 con cuerpo invalido %j (ValidationPipe)', async (body) => {
      await login(body).expect(400);
      expect(where).not.toHaveBeenCalled();
    });

    it('429 al 6.o intento en un minuto desde la misma IP', async () => {
      candidatos([]);
      for (let i = 0; i < 5; i++) {
        await login({ usuario: 'nadie', clave: 'x' }).expect(401);
      }
      const res = await login({ usuario: 'nadie', clave: 'x' }).expect(429);
      expect(res.body).toEqual({
        statusCode: 429,
        message: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.',
      });
    });
  });

  describe('GET /auth/me', () => {
    const payload = { sub: 'U-001', usuario: 'jperez', rol: 'Promotor' };

    it('200 con el usuario leido de la BD (rol vigente)', async () => {
      first.mockResolvedValue(fila({ Rol: 'Supervisor' }));
      const token = await jwt.signAsync(payload);
      const res = await me(token).expect(200);
      expect(res.body).toEqual({
        id: 'U-001',
        usuario: 'jperez',
        nombres: 'Juan Pérez',
        rol: 'Supervisor',
        area: null,
      });
      expect(first).toHaveBeenCalledWith({ IdUsuario: 'U-001' });
    });

    it('200 con el área del usuario cuando tiene una asignada', async () => {
      first.mockResolvedValue(fila({ id_area: 7 }));
      const token = await jwt.signAsync(payload);
      const res = await me(token).expect(200);
      expect(res.body.area).toEqual({ id: 7, codigo: 'PROCURA', nombre: 'Procura' });
    });

    it('401 sin token', async () => {
      await me().expect(401);
      expect(first).not.toHaveBeenCalled();
    });

    it('401 con token mal firmado', async () => {
      const ajeno = new JwtService({ secret: 'z'.repeat(64) });
      await me(await ajeno.signAsync(payload)).expect(401);
    });

    it('401 con token basura', async () => {
      await me('no.es.jwt').expect(401);
    });

    it('401 con token expirado', async () => {
      first.mockResolvedValue(fila());
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-14T08:00:00Z'));
      const token = await jwt.signAsync(payload);
      vi.setSystemTime(new Date('2026-10-14T16:00:01Z'));
      await me(token).expect(401);
    });

    it('401 si el usuario fue borrado', async () => {
      first.mockResolvedValue(null);
      await me(await jwt.signAsync(payload)).expect(401);
    });

    it('403 USUARIO_INACTIVO si el usuario fue desactivado (sesión abierta cortada)', async () => {
      first.mockResolvedValue(fila({ activo: false }));
      const res = await me(await jwt.signAsync(payload)).expect(403);
      expect(res.body.codigo).toBe('USUARIO_INACTIVO');
    });
  });

  describe('GET /auth/mis-permisos', () => {
    const misPermisos = (token?: string) => {
      const req = request(app.getHttpServer()).get('/auth/mis-permisos');
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };
    const tokenDe = (rol: string) => jwt.signAsync({ sub: 'U-001', usuario: 'jperez', rol });
    const NADA = { ver: false, crear: false, editar: false, eliminar: false, aprobar: false, anular: false };
    const TODO = { ver: true, crear: true, editar: true, eliminar: true, aprobar: true, anular: true };

    it('rol normal: sus filas; sin fila o módulo inactivo/ausente → false; todas las claves presentes', async () => {
      first.mockResolvedValue(fila({ Rol: 'Promotor' }));
      // El rol del token se ignora: manda el de la BD.
      const res = await misPermisos(await tokenDe('Administrador')).expect(200);
      expect(res.body.rol).toBe('Promotor');
      expect(res.body.esAdministrador).toBe(false);
      expect(Object.keys(res.body.permisos)).toEqual([...CLAVES_MODULO]);
      expect(res.body.permisos['dashboard']).toEqual({ ...NADA, ver: true });
      expect(res.body.permisos['tesoreria.pagos']).toEqual({ ...TODO, eliminar: false, aprobar: false });
      expect(res.body.permisos['documentos.administracion']).toEqual(NADA);
      expect(res.body.permisos['admin.roles']).toEqual(NADA); // módulo inactivo
      expect(res.body.permisos['almacen.stock']).toEqual(NADA); // ausente del catálogo
    });

    it('Administrador: todo true; aprobar/anular solo donde el módulo lo admite', async () => {
      first.mockResolvedValue(fila({ Rol: 'Administrador' }));
      const res = await misPermisos(await tokenDe('Promotor')).expect(200);
      expect(res.body.rol).toBe('Administrador');
      expect(res.body.esAdministrador).toBe(true);
      expect(res.body.permisos['documentos.administracion']).toEqual(TODO);
      expect(res.body.permisos['tesoreria.pagos']).toEqual({ ...TODO, aprobar: false });
      expect(res.body.permisos['dashboard']).toEqual({ ...TODO, aprobar: false, anular: false });
    });

    it('rol sin filas: todo false', async () => {
      first.mockResolvedValue(fila({ Rol: 'Sin Permisos' }));
      const a = await misPermisos(await tokenDe('x')).expect(200);
      expect(a.body.rol).toBe('Sin Permisos');
      expect(Object.values(a.body.permisos).every((p) => JSON.stringify(p) === JSON.stringify(NADA))).toBe(true);
    });

    it("usuario sin rol: todo false (rol '')", async () => {
      first.mockResolvedValue(fila({ Rol: null }));
      const b = await misPermisos(await tokenDe('x')).expect(200);
      expect(b.body).toMatchObject({ rol: '', esAdministrador: false });
      expect(b.body.permisos['dashboard']).toEqual(NADA);
    });

    it('401 sin sesión; 403 si el usuario está desactivado', async () => {
      await misPermisos().expect(401);
      first.mockResolvedValue(fila({ activo: false }));
      await misPermisos(await tokenDe('Promotor')).expect(403);
    });
  });
});
