import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MODULO_KEY } from '../../../platform/auth/decorators/permisos.decorator.js';
import { PermisosRolService } from '../../../platform/auth/permisos/permisos-rol.js';
import { SesionUsuariosService } from '../../../platform/auth/usuarios/sesion-usuarios.js';
import { ROL_ADMINISTRADOR } from '../../../platform/auth/permisos/roles.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { RolController } from './rol.controller.js';
import { RolHandler } from './rol.handler.js';

interface RolRow {
  id: number;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
}
interface UsuarioRow {
  IdUsuario: string;
  Rol: string | null;
}

/**
 * BD en memoria con la forma de la ORM que usa el handler. `transaction`
 * entrega un `tx` propio y deshace los cambios si el callback lanza; la
 * actualización masiva de usuarios FUERA de la transacción falla a propósito.
 */
function crearBd() {
  const estado = {
    roles: [] as RolRow[],
    usuarios: [] as UsuarioRow[],
    enTransaccion: false,
    usuariosActualizadosEnTx: 0,
    fallarAlActualizarUsuarios: false,
  };
  let siguienteId = 1;

  const rolOrm = () => ({
    orderBy: () => ({
      all: async () => [...estado.roles].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    }),
    all: async () => estado.roles.map((r) => ({ ...r })),
    first: async ({ id }: { id: number }) => {
      const r = estado.roles.find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    create: async (data: Omit<RolRow, 'id'>) => {
      if (estado.roles.some((r) => r.nombre === data.nombre)) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      const row = { id: siguienteId++, ...data };
      estado.roles.push(row);
      return { ...row };
    },
    where: ({ id }: { id: number }) => ({
      update: async (data: Partial<RolRow>) => {
        const r = estado.roles.find((x) => x.id === id);
        if (!r) return null;
        Object.assign(r, data);
        return { ...r };
      },
      delete: async () => {
        const i = estado.roles.findIndex((x) => x.id === id);
        if (i < 0) return null;
        return estado.roles.splice(i, 1)[0];
      },
    }),
  });

  const usuariosOrm = (dentroDeTx: boolean) => ({
    groupBy: () => ({
      aggregate: async () => {
        const m = new Map<string | null, number>();
        for (const u of estado.usuarios) m.set(u.Rol, (m.get(u.Rol) ?? 0) + 1);
        return [...m].map(([Rol, n]) => ({ Rol, n }));
      },
    }),
    where: ({ Rol }: { Rol: string }) => ({
      aggregate: async () => ({ n: estado.usuarios.filter((u) => u.Rol === Rol).length }),
      updateAndCount: async (data: { Rol: string }) => {
        if (!dentroDeTx || !estado.enTransaccion) {
          throw new Error('usuarios.Rol debe actualizarse dentro de la transacción');
        }
        if (estado.fallarAlActualizarUsuarios) throw new Error('fallo simulado');
        const afectados = estado.usuarios.filter((u) => u.Rol === Rol);
        for (const u of afectados) u.Rol = data.Rol;
        estado.usuariosActualizadosEnTx += afectados.length;
        return afectados.length;
      },
    }),
  });

  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const copia = structuredClone({ roles: estado.roles, usuarios: estado.usuarios });
    estado.enTransaccion = true;
    try {
      return await fn({ orm: { public: { rol: rolOrm(), Usuarios: usuariosOrm(true) } } });
    } catch (error) {
      estado.roles = copia.roles;
      estado.usuarios = copia.usuarios;
      throw error;
    } finally {
      estado.enTransaccion = false;
    }
  });

  const db = {
    transaction,
    orm: { public: { rol: rolOrm(), Usuarios: usuariosOrm(false) } },
  } as unknown as Database;

  const sembrar = () => {
    estado.roles = [
      { id: 1, nombre: 'Administrador', descripcion: 'Acceso total, incluida la administración de usuarios y empresas', es_sistema: true },
      { id: 2, nombre: 'Promotor', descripcion: null, es_sistema: false },
      { id: 3, nombre: 'Supervisor', descripcion: null, es_sistema: false },
      { id: 4, nombre: 'Usuario', descripcion: null, es_sistema: false },
    ];
    estado.usuarios = [
      { IdUsuario: 'USR-0001', Rol: 'Usuario' },
      { IdUsuario: 'USR-0002', Rol: 'Administrador' },
      { IdUsuario: 'USR-0003', Rol: 'Promotor' },
      { IdUsuario: 'USR-0004', Rol: 'Promotor' },
      { IdUsuario: 'USR-0005', Rol: 'promotor' }, // otro nombre: comparación exacta
      { IdUsuario: 'USR-0006', Rol: null },
    ];
    siguienteId = 5;
    estado.usuariosActualizadosEnTx = 0;
    estado.fallarAlActualizarUsuarios = false;
  };

  return { db, estado, sembrar, transaction };
}

describe('roles (/administration/roles)', () => {
  let app: INestApplication;
  const bd = crearBd();
  const sesiones = { invalidar: vi.fn(), invalidarTodo: vi.fn() };
  const permisosRol = { invalidarRol: vi.fn(), invalidarTodo: vi.fn() };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RolController],
      providers: [
        RolHandler,
        { provide: DB, useValue: bd.db },
        { provide: SesionUsuariosService, useValue: sesiones },
        { provide: PermisosRolService, useValue: permisosRol },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    bd.sembrar();
    bd.transaction.mockClear();
    sesiones.invalidarTodo.mockClear();
    permisosRol.invalidarRol.mockClear();
    permisosRol.invalidarTodo.mockClear();
  });

  it('todo el controller pertenece al módulo admin.roles (Administración: siempre estricto)', () => {
    expect(ROL_ADMINISTRADOR).toBe('Administrador');
    expect(Reflect.getMetadata(MODULO_KEY, RolController)).toBe('admin.roles');
  });

  describe('GET', () => {
    it('lista con el conteo exacto de usuarios, sistema primero y luego por nombre', async () => {
      bd.estado.roles.push({ id: 9, nombre: 'Almacenero', descripcion: null, es_sistema: false });
      const res = await http().get('/administration/roles').expect(200);
      expect(res.body).toEqual([
        { id: 1, nombre: 'Administrador', descripcion: 'Acceso total, incluida la administración de usuarios y empresas', es_sistema: true, usuarios: 1 },
        { id: 9, nombre: 'Almacenero', descripcion: null, es_sistema: false, usuarios: 0 },
        { id: 2, nombre: 'Promotor', descripcion: null, es_sistema: false, usuarios: 2 },
        { id: 3, nombre: 'Supervisor', descripcion: null, es_sistema: false, usuarios: 0 },
        { id: 4, nombre: 'Usuario', descripcion: null, es_sistema: false, usuarios: 1 },
      ]);
    });

    it('un rol del sistema va primero aunque su nombre ordene después', async () => {
      bd.estado.roles.push({ id: 9, nombre: 'Auditor', descripcion: null, es_sistema: false });
      bd.estado.roles[0].nombre = 'Zeta';
      const res = await http().get('/administration/roles').expect(200);
      expect(res.body.map((r: RolRow) => r.nombre)).toEqual(['Zeta', 'Auditor', 'Promotor', 'Supervisor', 'Usuario']);
    });
  });

  describe('POST', () => {
    it('crea un rol (201, usuarios: 0) recortando espacios', async () => {
      const res = await http()
        .post('/administration/roles')
        .send({ nombre: '  Jefe de Almacén N.º-2  ', descripcion: '  Controla stock  ' })
        .expect(201);
      expect(res.body).toEqual({ id: 5, nombre: 'Jefe de Almacén N.º-2', descripcion: 'Controla stock', es_sistema: false, usuarios: 0 });
      expect(bd.estado.roles.at(-1)).toMatchObject({ nombre: 'Jefe de Almacén N.º-2', es_sistema: false });
    });

    it('la descripción es opcional y admite null', async () => {
      const a = await http().post('/administration/roles').send({ nombre: 'Logística' }).expect(201);
      expect(a.body.descripcion).toBeNull();
      const b = await http().post('/administration/roles').send({ nombre: 'Compras', descripcion: null }).expect(201);
      expect(b.body.descripcion).toBeNull();
    });

    it('ignora es_sistema enviado por el cliente', async () => {
      const res = await http().post('/administration/roles').send({ nombre: 'Otro', es_sistema: true }).expect(201);
      expect(res.body.es_sistema).toBe(false);
    });

    it.each([
      ['sin nombre', {}],
      ['nombre de 1 carácter', { nombre: 'A' }],
      ['nombre de solo espacios', { nombre: '   ' }],
      ['nombre de 51 caracteres', { nombre: 'x'.repeat(51) }],
      ['nombre con caracteres inválidos', { nombre: 'Admin<script>' }],
      ['nombre con guion bajo', { nombre: 'rol_x' }],
      ['nombre con @', { nombre: 'rol@x' }],
      ['nombre no string', { nombre: 123 }],
      ['descripción de 256', { nombre: 'Valido', descripcion: 'd'.repeat(256) }],
    ])('%s → 400', async (_caso, body) => {
      await http().post('/administration/roles').send(body).expect(400);
      expect(bd.estado.roles).toHaveLength(4);
    });

    it('acepta exactamente 2 y 50 caracteres', async () => {
      await http().post('/administration/roles').send({ nombre: 'TI' }).expect(201);
      await http().post('/administration/roles').send({ nombre: 'y'.repeat(50) }).expect(201);
    });

    it('duplicado sin distinguir mayúsculas → 409', async () => {
      const res = await http().post('/administration/roles').send({ nombre: ' sUPERVISOR ' }).expect(409);
      expect(res.body.message).toBe('Ya existe un rol llamado "sUPERVISOR"');
      expect(bd.estado.roles).toHaveLength(4);
    });

    it('si la BD rechaza el nombre por unicidad (23505) → 409', async () => {
      const original = bd.db.orm.public.rol.all;
      (bd.db.orm.public.rol as { all: unknown }).all = async () => [];
      try {
        await http().post('/administration/roles').send({ nombre: 'Promotor' }).expect(409);
      } finally {
        (bd.db.orm.public.rol as { all: unknown }).all = original;
      }
    });
  });

  describe('PATCH', () => {
    it('renombrar actualiza usuarios.Rol dentro de la transacción', async () => {
      const res = await http().patch('/administration/roles/2').send({ nombre: 'Promotor Senior' }).expect(200);
      expect(res.body).toEqual({ id: 2, nombre: 'Promotor Senior', descripcion: null, es_sistema: false, usuarios: 2 });
      expect(bd.transaction).toHaveBeenCalledTimes(1);
      expect(bd.estado.usuariosActualizadosEnTx).toBe(2);
      expect(bd.estado.usuarios.filter((u) => u.Rol === 'Promotor Senior').map((u) => u.IdUsuario)).toEqual(['USR-0003', 'USR-0004']);
      // Comparación exacta: 'promotor' (minúsculas) no se toca.
      expect(bd.estado.usuarios.find((u) => u.IdUsuario === 'USR-0005')?.Rol).toBe('promotor');
      // usuarios.Rol cambió: la caché de sesiones (rol vigente) se descarta.
      expect(sesiones.invalidarTodo).toHaveBeenCalledTimes(1);
      // La caché de permisos es por nombre de rol: también se descarta.
      expect(permisosRol.invalidarTodo).toHaveBeenCalledTimes(1);
    });

    it('editar solo la descripción no invalida la caché de sesiones', async () => {
      await http().patch('/administration/roles/2').send({ descripcion: 'x' }).expect(200);
      expect(sesiones.invalidarTodo).not.toHaveBeenCalled();
      expect(permisosRol.invalidarTodo).not.toHaveBeenCalled();
    });

    it('si falla la actualización de usuarios se revierte también el renombrado', async () => {
      bd.estado.fallarAlActualizarUsuarios = true;
      await http().patch('/administration/roles/2').send({ nombre: 'Promotor Senior' }).expect(500);
      expect(bd.estado.roles.find((r) => r.id === 2)?.nombre).toBe('Promotor');
      expect(bd.estado.usuarios.filter((u) => u.Rol === 'Promotor')).toHaveLength(2);
    });

    it('renombrar un rol del sistema → 409', async () => {
      const res = await http().patch('/administration/roles/1').send({ nombre: 'Admin' }).expect(409);
      expect(res.body.message).toBe('El rol "Administrador" es del sistema y no se puede renombrar');
      expect(bd.estado.roles[0].nombre).toBe('Administrador');
      expect(bd.estado.usuarios.find((u) => u.IdUsuario === 'USR-0002')?.Rol).toBe('Administrador');
    });

    it('editar solo la descripción del Administrador → 200', async () => {
      const res = await http().patch('/administration/roles/1').send({ descripcion: 'Todo el sistema' }).expect(200);
      expect(res.body).toEqual({ id: 1, nombre: 'Administrador', descripcion: 'Todo el sistema', es_sistema: true, usuarios: 1 });
      expect(bd.estado.usuariosActualizadosEnTx).toBe(0);
    });

    it('reenviar el mismo nombre de un rol del sistema no cuenta como renombrar', async () => {
      await http().patch('/administration/roles/1').send({ nombre: 'Administrador', descripcion: null }).expect(200);
      expect(bd.estado.roles[0].descripcion).toBeNull();
    });

    it('nombre duplicado (sin distinguir mayúsculas) → 409', async () => {
      const res = await http().patch('/administration/roles/3').send({ nombre: 'USUARIO' }).expect(409);
      expect(res.body.message).toBe('Ya existe un rol llamado "USUARIO"');
      expect(bd.estado.roles.find((r) => r.id === 3)?.nombre).toBe('Supervisor');
    });

    it('cambiar solo mayúsculas del propio nombre está permitido y arrastra a los usuarios', async () => {
      await http().patch('/administration/roles/4').send({ nombre: 'USUARIO' }).expect(200);
      expect(bd.estado.usuarios.find((u) => u.IdUsuario === 'USR-0001')?.Rol).toBe('USUARIO');
    });

    it('inexistente → 404', async () => {
      await http().patch('/administration/roles/99').send({ descripcion: 'x' }).expect(404);
    });

    it('nombre inválido → 400', async () => {
      await http().patch('/administration/roles/2').send({ nombre: 'x' }).expect(400);
      await http().patch('/administration/roles/2').send({ nombre: 'a/b' }).expect(400);
    });
  });

  describe('DELETE', () => {
    it('con usuarios asignados → 409 con el número', async () => {
      const res = await http().delete('/administration/roles/2').expect(409);
      expect(res.body.message).toBe('No se puede eliminar "Promotor": tiene 2 usuario(s) asignado(s). Reasígnalos primero.');
      expect(bd.estado.roles).toHaveLength(4);
    });

    it('rol del sistema → 409', async () => {
      const res = await http().delete('/administration/roles/1').expect(409);
      expect(res.body.message).toBe('El rol "Administrador" es del sistema y no se puede eliminar');
    });

    it('sin usuarios → 204', async () => {
      await http().delete('/administration/roles/3').expect(204);
      expect(bd.estado.roles.map((r) => r.nombre)).toEqual(['Administrador', 'Promotor', 'Usuario']);
      expect(permisosRol.invalidarRol).toHaveBeenCalledWith('Supervisor');
    });

    it('inexistente → 404', async () => {
      await http().delete('/administration/roles/99').expect(404);
    });

    it('id no numérico → 400', async () => {
      await http().delete('/administration/roles/abc').expect(400);
    });
  });
});
