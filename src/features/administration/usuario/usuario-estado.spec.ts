import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AuthUser } from '../../../platform/auth/auth-user.js';
import { SesionUsuariosService } from '../../../platform/auth/sesion-usuarios.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { UsuarioController } from './usuario.controller.js';
import { UsuarioHandler } from './usuario.handler.js';

interface UsuarioRow {
  IdUsuario: string;
  Nombres: string | null;
  Usuario: string | null;
  Clave: string | null;
  Rol: string | null;
  activo: boolean;
}
interface RolRow {
  id: number;
  nombre: string;
  es_sistema: boolean;
}

const coincide = <T extends object>(fila: T, filtro: Partial<T>) =>
  Object.entries(filtro).every(([k, v]) => fila[k as keyof T] === v);

/**
 * BD en memoria con la forma de la ORM que usan `cambiarEstado`, `update` (cambio de rol) y `remove`. `transaction` deshace los
 * cambios si el callback lanza y registra los bloqueos (UPDATE sin cambios) tomados dentro.
 */
function crearBd() {
  const estado = {
    usuarios: [] as UsuarioRow[],
    roles: [] as RolRow[],
    enTransaccion: false,
    bloqueados: [] as string[],
  };

  const usuariosOrm = (dentroDeTx: boolean) => ({
    first: async ({ IdUsuario }: { IdUsuario: string }) => {
      const u = estado.usuarios.find((x) => x.IdUsuario === IdUsuario);
      return u ? { ...u } : null;
    },
    where: (filtro: Partial<UsuarioRow>) => ({
      all: async () => estado.usuarios.filter((u) => coincide(u, filtro)).map((u) => ({ ...u })),
      update: async (data: Partial<UsuarioRow>) => {
        if (!dentroDeTx || !estado.enTransaccion) throw new Error('el estado se cambia dentro de la transacción');
        const u = estado.usuarios.find((x) => coincide(x, filtro));
        if (!u) return null;
        Object.assign(u, data);
        return { ...u };
      },
      delete: async () => {
        if (!dentroDeTx || !estado.enTransaccion) throw new Error('el borrado va dentro de la transacción');
        const u = estado.usuarios.find((x) => coincide(x, filtro));
        if (!u) return null;
        estado.usuarios = estado.usuarios.filter((x) => x !== u);
        return { ...u };
      },
      updateAndCount: async (data: Partial<UsuarioRow>) => {
        if (!dentroDeTx || !estado.enTransaccion) throw new Error('el bloqueo va dentro de la transacción');
        const afectados = estado.usuarios.filter((u) => coincide(u, filtro));
        for (const u of afectados) {
          Object.assign(u, data);
          estado.bloqueados.push(u.IdUsuario);
        }
        return afectados.length;
      },
    }),
  });
  const rolOrm = {
    first: async ({ nombre }: { nombre: string }) => estado.roles.find((r) => r.nombre === nombre) ?? null,
    where: (filtro: Partial<RolRow>) => ({
      all: async () => estado.roles.filter((r) => coincide(r, filtro)).map((r) => ({ ...r })),
    }),
  };

  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const copia = structuredClone(estado.usuarios);
    estado.enTransaccion = true;
    try {
      return await fn({ orm: { public: { Usuarios: usuariosOrm(true), rol: rolOrm } } });
    } catch (error) {
      estado.usuarios = copia;
      throw error;
    } finally {
      estado.enTransaccion = false;
    }
  });

  const db = {
    transaction,
    orm: { public: { Usuarios: usuariosOrm(false), rol: rolOrm } },
  } as unknown as Database;

  const u = (IdUsuario: string, Rol: string | null, activo = true): UsuarioRow => ({
    IdUsuario,
    Nombres: `Nombre ${IdUsuario}`,
    Usuario: IdUsuario.toLowerCase(),
    Clave: '$argon2id$hash',
    Rol,
    activo,
  });

  const sembrar = () => {
    estado.roles = [
      { id: 1, nombre: 'Administrador', es_sistema: true },
      { id: 2, nombre: 'Promotor', es_sistema: false },
    ];
    estado.usuarios = [
      u('USR-0001', 'Administrador'),
      u('USR-0002', 'Promotor'),
      u('USR-0003', 'Administrador', false),
      u('USR-0004', null),
    ];
    estado.bloqueados = [];
  };

  return { db, estado, sembrar, transaction, u };
}

describe('PATCH /administration/usuarios/:id/estado', () => {
  let app: INestApplication;
  const bd = crearBd();
  const sesiones = { invalidar: vi.fn(), invalidarTodo: vi.fn() };
  /** Usuario de la sesión (lo dejaría `JwtAuthGuard`). */
  let actor: AuthUser = { id: 'USR-0001', usuario: 'usr-0001', rol: 'Administrador' };

  const patch = (id: string, body: object) =>
    request(app.getHttpServer()).patch(`/administration/usuarios/${id}/estado`).send(body);
  const fila = (id: string) => bd.estado.usuarios.find((x) => x.IdUsuario === id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsuarioController],
      providers: [
        UsuarioHandler,
        { provide: DB, useValue: bd.db },
        { provide: SesionUsuariosService, useValue: sesiones },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use((req: { user?: AuthUser }, _res: unknown, next: () => void) => {
      req.user = actor;
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    bd.sembrar();
    bd.transaction.mockClear();
    sesiones.invalidar.mockClear();
    actor = { id: 'USR-0001', usuario: 'usr-0001', rol: 'Administrador' };
  });

  it('desactiva un usuario (200 con activo: false) e invalida su sesión en caché', async () => {
    const res = await patch('USR-0002', { activo: false }).expect(200);
    expect(res.body).toEqual({
      IdUsuario: 'USR-0002',
      Nombres: 'Nombre USR-0002',
      Usuario: 'usr-0002',
      Rol: 'Promotor',
      activo: false,
    });
    expect(res.body).not.toHaveProperty('Clave');
    expect(fila('USR-0002')?.activo).toBe(false);
    expect(bd.transaction).toHaveBeenCalledTimes(1);
    expect(sesiones.invalidar).toHaveBeenCalledWith('USR-0002');
  });

  it('reactiva un usuario (también un Administrador inactivo)', async () => {
    const res = await patch('USR-0003', { activo: true }).expect(200);
    expect(res.body.activo).toBe(true);
    expect(fila('USR-0003')?.activo).toBe(true);
    expect(sesiones.invalidar).toHaveBeenCalledWith('USR-0003');
  });

  it('desactivar a uno ya inactivo es idempotente', async () => {
    await patch('USR-0003', { activo: false }).expect(200);
    expect(fila('USR-0003')?.activo).toBe(false);
  });

  it('desactivarse a uno mismo → 409', async () => {
    actor = { id: 'USR-0002', usuario: 'usr-0002', rol: 'Promotor' };
    const res = await patch('USR-0002', { activo: false }).expect(409);
    expect(res.body.message).toBe('No puedes desactivar tu propio usuario');
    expect(fila('USR-0002')?.activo).toBe(true);
    expect(sesiones.invalidar).not.toHaveBeenCalled();
  });

  it('desactivar al último Administrador activo → 409 (el otro Administrador está inactivo)', async () => {
    actor = { id: 'USR-0002', usuario: 'usr-0002', rol: 'Promotor' };
    const res = await patch('USR-0001', { activo: false }).expect(409);
    expect(res.body.message).toBe('Debe quedar al menos un Administrador activo');
    expect(fila('USR-0001')?.activo).toBe(true);
    // Se bloquearon las filas de los Administradores activos antes de contar.
    expect(bd.estado.bloqueados).toEqual(['USR-0001']);
  });

  it('con dos Administradores activos se puede desactivar uno, pero no el segundo', async () => {
    bd.estado.usuarios.push(bd.u('USR-0005', 'Administrador'));
    await patch('USR-0005', { activo: false }).expect(200);
    expect(fila('USR-0005')?.activo).toBe(false);

    actor = { id: 'USR-0005', usuario: 'usr-0005', rol: 'Administrador' };
    await patch('USR-0001', { activo: false }).expect(409);
  });

  it('el Administrador es el rol de sistema, aunque se llame distinto', async () => {
    bd.estado.roles[0].nombre = 'Superusuario';
    bd.estado.usuarios = [
      bd.u('USR-0001', 'Superusuario'),
      bd.u('USR-0002', 'Administrador'), // nombre que ya no es de sistema
    ];
    actor = { id: 'USR-0002', usuario: 'usr-0002', rol: 'Administrador' };
    const res = await patch('USR-0001', { activo: false }).expect(409);
    expect(res.body.message).toBe('Debe quedar al menos un Administrador activo');
  });

  it('desactivar a un usuario que no es Administrador no cuenta Administradores', async () => {
    bd.estado.usuarios = bd.estado.usuarios.filter((x) => x.Rol !== 'Administrador');
    bd.estado.usuarios.push(bd.u('USR-0001', 'Administrador'));
    await patch('USR-0004', { activo: false }).expect(200);
    expect(bd.estado.bloqueados).toEqual([]);
  });

  it('inexistente → 404', async () => {
    await patch('USR-9999', { activo: false }).expect(404);
    await patch('x'.repeat(300), { activo: true }).expect(404);
  });

  it.each([
    ['sin activo', {}],
    ['activo como texto', { activo: 'false' }],
    ['activo numérico', { activo: 0 }],
  ])('%s → 400', async (_caso, body) => {
    await patch('USR-0002', body).expect(400);
    expect(fila('USR-0002')?.activo).toBe(true);
    expect(bd.transaction).not.toHaveBeenCalled();
  });
});

describe('último Administrador al cambiar el rol o borrar; borrarse a sí mismo', () => {
  let app: INestApplication;
  const bd = crearBd();
  const sesiones = { invalidar: vi.fn(), invalidarTodo: vi.fn() };
  let actor: AuthUser = { id: 'USR-0001', usuario: 'usr-0001', rol: 'Administrador' };

  const http = () => request(app.getHttpServer());
  const fila = (id: string) => bd.estado.usuarios.find((x) => x.IdUsuario === id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsuarioController],
      providers: [
        UsuarioHandler,
        { provide: DB, useValue: bd.db },
        { provide: SesionUsuariosService, useValue: sesiones },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use((req: { user?: AuthUser }, _res: unknown, next: () => void) => {
      req.user = actor;
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    bd.sembrar();
    bd.transaction.mockClear();
    sesiones.invalidar.mockClear();
    actor = { id: 'USR-0002', usuario: 'usr-0002', rol: 'Promotor' };
  });

  describe('PATCH /administration/usuarios/:id con otro Rol', () => {
    it('quitarle el rol de Administrador al último activo → 409 y no cambia nada', async () => {
      const res = await http().patch('/administration/usuarios/USR-0001').send({ Rol: 'Promotor' }).expect(409);
      expect(res.body.message).toBe('Debe quedar al menos un Administrador activo');
      expect(fila('USR-0001')?.Rol).toBe('Administrador');
      // Mismo bloqueo FOR UPDATE que cambiarEstado, dentro de la transacción.
      expect(bd.transaction).toHaveBeenCalledTimes(1);
      expect(bd.estado.bloqueados).toEqual(['USR-0001']);
      expect(sesiones.invalidar).not.toHaveBeenCalled();
    });

    it('con otro Administrador activo sí se puede (y se invalida la sesión)', async () => {
      bd.estado.usuarios.push(bd.u('USR-0005', 'Administrador'));
      const res = await http().patch('/administration/usuarios/USR-0001').send({ Rol: 'Promotor' }).expect(200);
      expect(res.body.Rol).toBe('Promotor');
      expect(fila('USR-0001')?.Rol).toBe('Promotor');
      expect(sesiones.invalidar).toHaveBeenCalledWith('USR-0001');
    });

    it('mantener el rol de Administrador o cambiar el de un Administrador inactivo no cuenta', async () => {
      await http().patch('/administration/usuarios/USR-0001').send({ Rol: 'Administrador', Nombres: 'Otro' }).expect(200);
      await http().patch('/administration/usuarios/USR-0003').send({ Rol: 'Promotor' }).expect(200);
      expect(fila('USR-0003')?.Rol).toBe('Promotor');
      expect(bd.estado.bloqueados).toEqual([]);
    });

    it('el rol de sistema se reconoce aunque se llame distinto', async () => {
      bd.estado.roles[0].nombre = 'Superusuario';
      bd.estado.usuarios = [bd.u('USR-0001', 'Superusuario'), bd.u('USR-0002', 'Promotor')];
      await http().patch('/administration/usuarios/USR-0001').send({ Rol: 'Promotor' }).expect(409);
    });

    it('inexistente → 404', async () => {
      await http().patch('/administration/usuarios/USR-9999').send({ Rol: 'Promotor' }).expect(404);
    });
  });

  describe('DELETE /administration/usuarios/:id', () => {
    it('borrarse a sí mismo → 409 sin tocar la BD', async () => {
      actor = { id: 'USR-0001', usuario: 'usr-0001', rol: 'Administrador' };
      bd.estado.usuarios.push(bd.u('USR-0005', 'Administrador'));
      const res = await http().delete('/administration/usuarios/USR-0001').expect(409);
      expect(res.body.message).toBe('No puedes eliminar tu propio usuario');
      expect(fila('USR-0001')).toBeDefined();
      expect(bd.transaction).not.toHaveBeenCalled();
    });

    it('borrar al último Administrador activo → 409 y no se borra', async () => {
      const res = await http().delete('/administration/usuarios/USR-0001').expect(409);
      expect(res.body.message).toBe('Debe quedar al menos un Administrador activo');
      expect(fila('USR-0001')).toBeDefined();
      expect(bd.estado.bloqueados).toEqual(['USR-0001']);
      expect(sesiones.invalidar).not.toHaveBeenCalled();
    });

    it('con otro Administrador activo se borra (204) e invalida su sesión', async () => {
      bd.estado.usuarios.push(bd.u('USR-0005', 'Administrador'));
      await http().delete('/administration/usuarios/USR-0001').expect(204);
      expect(fila('USR-0001')).toBeUndefined();
      expect(sesiones.invalidar).toHaveBeenCalledWith('USR-0001');
    });

    it('borrar a un Administrador inactivo o a un usuario normal no cuenta Administradores', async () => {
      await http().delete('/administration/usuarios/USR-0003').expect(204);
      await http().delete('/administration/usuarios/USR-0004').expect(204);
      expect(bd.estado.bloqueados).toEqual([]);
    });

    it('inexistente → 404', async () => {
      await http().delete('/administration/usuarios/USR-9999').expect(404);
    });
  });
});
