import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { hashClave } from '../../platform/auth/passwords.js';
import { DB, PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from './auth.module.js';

const SECRET = 'k'.repeat(64);
const CLAVE = 'secreta123';
const OCHO_HORAS = 8 * 3600;

const where = vi.fn();
const first = vi.fn();
const usuarios = { where, first };

@Module({
  providers: [{ provide: DB, useValue: { orm: { public: { Usuarios: usuarios } } } }],
  exports: [DB],
})
class FakePrismaModule {}

let hashGuardado: string;

function fila(over: Partial<Record<string, string | null>> = {}) {
  return {
    IdUsuario: 'U-001',
    Nombres: 'Juan Pérez',
    Usuario: 'jperez',
    Clave: hashGuardado,
    Rol: 'Promotor',
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
    it('200 con token, expiraEn y usuario (sin clave)', async () => {
      candidatos([fila()]);
      const res = await login({ usuario: 'jperez', clave: CLAVE }).expect(200);

      expect(Object.keys(res.body).sort()).toEqual(['expiraEn', 'token', 'usuario']);
      expect(res.body.usuario).toEqual({
        id: 'U-001',
        usuario: 'jperez',
        nombres: 'Juan Pérez',
        rol: 'Promotor',
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
      });
      expect(first).toHaveBeenCalledWith({ IdUsuario: 'U-001' });
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
  });
});
