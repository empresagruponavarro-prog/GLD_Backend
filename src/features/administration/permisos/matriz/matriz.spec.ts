import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CLAVES_MODULO } from '../../../../platform/auth/permisos/permisos.js';
import { MODULO_KEY } from '../../../../platform/auth/decorators/permisos.decorator.js';
import { PermisosRolService } from '../../../../platform/auth/permisos/permisos-rol.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import { MatrizPermisosController } from './matriz.controller.js';
import { MatrizPermisosHandler } from './matriz.handler.js';

interface RolRow {
  id: number;
  nombre: string;
  es_sistema: boolean;
}
interface ModuloRow {
  id: number;
  clave: string;
  orden: number;
  admite_aprobar: boolean;
  admite_anular: boolean;
  activo: boolean;
}
interface PermisoRow {
  rol_id: number;
  modulo_id: number;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  aprobar: boolean;
  anular: boolean;
}
type Acciones = Omit<PermisoRow, 'rol_id' | 'modulo_id'>;

const APROBAR = new Set(['documentos.administracion', 'requerimientos.aprobacion']);
const ANULAR = new Set([
  'documentos.administracion',
  'documentos.origen',
  'tesoreria.programacion',
  'tesoreria.pagos',
  'almacen.recepciones',
  'almacen.ingresos',
  'almacen.salidas',
  'almacen.transferencias',
  'almacen.prestamos',
  'almacen.inventario-inicial',
]);
const NADA: Acciones = { ver: false, crear: false, editar: false, eliminar: false, aprobar: false, anular: false };
const BASICO: Acciones = { ver: true, crear: true, editar: true, eliminar: true, aprobar: false, anular: false };

/**
 * BD en memoria con la forma de la ORM que usa el handler. `transaction` entrega un `tx` propio y
 * deshace TODO si el callback lanza; borrar/insertar permisos fuera de la transacción falla.
 */
function crearBd() {
  const estado = {
    roles: [] as RolRow[],
    modulos: [] as ModuloRow[],
    permisos: [] as PermisoRow[],
    enTransaccion: false,
    rolesBloqueados: [] as number[],
    fallarAlInsertar: false,
  };

  const rolOrm = (dentroDeTx: boolean) => ({
    first: async ({ id }: { id: number }) => {
      const r = estado.roles.find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    where: ({ id, es_sistema }: { id: number; es_sistema: boolean }) => ({
      update: async (data: Partial<RolRow>) => {
        if (!dentroDeTx || !estado.enTransaccion) throw new Error('el bloqueo va dentro de la transacción');
        const r = estado.roles.find((x) => x.id === id && x.es_sistema === es_sistema);
        if (!r) return null;
        Object.assign(r, data);
        estado.rolesBloqueados.push(id);
        return { ...r };
      },
    }),
  });
  const moduloOrm = {
    where: ({ activo }: { activo: boolean }) => ({
      orderBy: () => ({
        all: async () => estado.modulos.filter((m) => m.activo === activo).map((m) => ({ ...m, nombre: m.clave, grupo: 'G', ruta: null })),
      }),
    }),
  };
  const permisoOrm = (dentroDeTx: boolean) => {
    const enTx = () => {
      if (!dentroDeTx || !estado.enTransaccion) throw new Error('rol_permiso se reemplaza dentro de la transacción');
    };
    return {
      where: ({ rol_id }: { rol_id: number }) => ({
        all: async () => estado.permisos.filter((p) => p.rol_id === rol_id).map((p) => ({ ...p })),
        deleteAndCount: async () => {
          enTx();
          const antes = estado.permisos.length;
          estado.permisos = estado.permisos.filter((p) => p.rol_id !== rol_id);
          return antes - estado.permisos.length;
        },
      }),
      createAndCount: async (filas: PermisoRow[]) => {
        enTx();
        if (estado.fallarAlInsertar) throw new Error('fallo simulado');
        estado.permisos.push(...filas.map((f) => ({ ...f })));
        return filas.length;
      },
    };
  };

  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const copia = structuredClone({ roles: estado.roles, permisos: estado.permisos });
    estado.enTransaccion = true;
    try {
      return await fn({ orm: { public: { rol: rolOrm(true), modulo: moduloOrm, rol_permiso: permisoOrm(true) } } });
    } catch (error) {
      estado.roles = copia.roles;
      estado.permisos = copia.permisos;
      throw error;
    } finally {
      estado.enTransaccion = false;
    }
  });

  const db = {
    transaction,
    orm: { public: { rol: rolOrm(false), modulo: moduloOrm, rol_permiso: permisoOrm(false) } },
  } as unknown as Database;

  const sembrar = () => {
    estado.roles = [
      { id: 1, nombre: 'Administrador', es_sistema: true },
      { id: 2, nombre: 'Promotor', es_sistema: false },
      { id: 5, nombre: 'Nuevo', es_sistema: false },
    ];
    estado.modulos = CLAVES_MODULO.map((clave, i) => ({
      id: i + 1,
      clave,
      orden: i + 1,
      admite_aprobar: APROBAR.has(clave),
      admite_anular: ANULAR.has(clave),
      activo: true,
    }));
    // D5: Promotor con todo salvo Administración (ids 31-33).
    estado.permisos = estado.modulos
      .filter((m) => !m.clave.startsWith('admin.'))
      .map((m) => ({ rol_id: 2, modulo_id: m.id, ...BASICO, aprobar: m.admite_aprobar, anular: m.admite_anular }));
    estado.rolesBloqueados = [];
    estado.fallarAlInsertar = false;
  };

  return { db, estado, sembrar, transaction };
}

describe('matriz de permisos (/administration/roles/:id/permisos)', () => {
  let app: INestApplication;
  const bd = crearBd();
  const permisosRol = { invalidarRol: vi.fn(), invalidarTodo: vi.fn() };
  const http = () => request(app.getHttpServer());
  const id = (clave: string) => CLAVES_MODULO.indexOf(clave as (typeof CLAVES_MODULO)[number]) + 1;

  /** Cuerpo del PUT con una entrada por módulo activo; `cambios` pisa algunas claves. */
  const cuerpo = (cambios: Record<string, Partial<Acciones>> = {}, base: Acciones = NADA) => ({
    permisos: bd.estado.modulos
      .filter((m) => m.activo)
      .map((m) => ({ clave: m.clave, ...base, ...cambios[m.clave] })),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MatrizPermisosController],
      providers: [
        MatrizPermisosHandler,
        { provide: DB, useValue: bd.db },
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
    permisosRol.invalidarRol.mockClear();
  });

  it('pertenece al módulo admin.roles (Administración: siempre estricto)', () => {
    expect(Reflect.getMetadata(MODULO_KEY, MatrizPermisosController)).toBe('admin.roles');
  });

  describe('GET', () => {
    it('rol normal con filas: una entrada por módulo activo, en orden; Administración en false', async () => {
      const res = await http().get('/administration/roles/2/permisos').expect(200);
      expect(res.body).toMatchObject({ rolId: 2, rol: 'Promotor', esSistema: false, bloqueado: false });
      expect(res.body.permisos.map((p: { clave: string }) => p.clave)).toEqual([...CLAVES_MODULO]);
      const porClave = new Map(res.body.permisos.map((p: { clave: string }) => [p.clave, p]));
      expect(porClave.get('dashboard')).toEqual({ moduloId: 1, clave: 'dashboard', ...BASICO });
      expect(porClave.get('documentos.administracion')).toEqual({
        moduloId: id('documentos.administracion'),
        clave: 'documentos.administracion',
        ...BASICO,
        aprobar: true,
        anular: true,
      });
      expect(porClave.get('tesoreria.pagos')).toMatchObject({ aprobar: false, anular: true });
      for (const clave of ['admin.empresas', 'admin.usuarios', 'admin.roles']) {
        expect(porClave.get(clave)).toMatchObject(NADA);
      }
    });

    it('rol sin filas: todo false', async () => {
      const res = await http().get('/administration/roles/5/permisos').expect(200);
      expect(res.body.permisos).toHaveLength(33);
      for (const p of res.body.permisos) expect(p).toEqual({ moduloId: p.moduloId, clave: p.clave, ...NADA });
    });

    it('omite los módulos inactivos', async () => {
      bd.estado.modulos[0].activo = false;
      const res = await http().get('/administration/roles/2/permisos').expect(200);
      expect(res.body.permisos).toHaveLength(32);
      expect(res.body.permisos[0].clave).toBe('modulos');
    });

    it('Administrador: todo true (aprobar/anular solo donde se admite) y bloqueado', async () => {
      const res = await http().get('/administration/roles/1/permisos').expect(200);
      expect(res.body).toMatchObject({ rolId: 1, rol: 'Administrador', esSistema: true, bloqueado: true });
      const porClave = new Map(res.body.permisos.map((p: { clave: string }) => [p.clave, p]));
      expect(porClave.get('admin.roles')).toMatchObject(BASICO);
      expect(porClave.get('documentos.administracion')).toMatchObject({ ...BASICO, aprobar: true, anular: true });
      expect(porClave.get('requerimientos.aprobacion')).toMatchObject({ aprobar: true, anular: false });
      expect(porClave.get('almacen.salidas')).toMatchObject({ aprobar: false, anular: true });
    });

    it('rol inexistente → 404; id no numérico → 400', async () => {
      const res = await http().get('/administration/roles/99/permisos').expect(404);
      expect(res.body.message).toBe('Rol con id 99 no encontrado');
      await http().get('/administration/roles/abc/permisos').expect(400);
    });
  });

  describe('PUT', () => {
    it('reemplaza la matriz completa en una transacción y responde como el GET', async () => {
      const body = cuerpo({
        dashboard: { ver: true },
        'tesoreria.pagos': { ver: true, crear: true, anular: true },
        'admin.usuarios': { ver: true, editar: true },
      });
      const res = await http().put('/administration/roles/2/permisos').send(body).expect(200);

      expect(bd.transaction).toHaveBeenCalledTimes(1);
      expect(bd.estado.rolesBloqueados).toEqual([2]);
      // Solo quedan las filas con Ver (sin fila = todo denegado).
      expect(bd.estado.permisos.filter((p) => p.rol_id === 2).map((p) => p.modulo_id)).toEqual([
        id('dashboard'),
        id('tesoreria.pagos'),
        id('admin.usuarios'),
      ]);
      expect(res.body).toMatchObject({ rolId: 2, rol: 'Promotor', bloqueado: false });
      const porClave = new Map(res.body.permisos.map((p: { clave: string }) => [p.clave, p]));
      expect(porClave.get('tesoreria.pagos')).toMatchObject({ ...NADA, ver: true, crear: true, anular: true });
      expect(porClave.get('admin.usuarios')).toMatchObject({ ...NADA, ver: true, editar: true });
      expect(porClave.get('almacen.stock')).toMatchObject(NADA);
      // La caché de permisos del rol se invalida al guardar: la API aplica la matriz nueva ya.
      expect(permisosRol.invalidarRol).toHaveBeenCalledWith('Promotor');
    });

    it('no toca los permisos de otros roles', async () => {
      bd.estado.permisos.push({ rol_id: 5, modulo_id: 1, ...BASICO });
      await http().put('/administration/roles/2/permisos').send(cuerpo()).expect(200);
      expect(bd.estado.permisos).toEqual([{ rol_id: 5, modulo_id: 1, ...BASICO }]);
    });

    it('si falla la inserción se revierte el borrado (atómico)', async () => {
      const antes = structuredClone(bd.estado.permisos);
      bd.estado.fallarAlInsertar = true;
      await http().put('/administration/roles/2/permisos').send(cuerpo({ dashboard: { ver: true } })).expect(500);
      expect(bd.estado.permisos).toEqual(antes);
    });

    it('falta un módulo → 400 con el detalle', async () => {
      const body = cuerpo();
      body.permisos = body.permisos.filter((p) => p.clave !== 'almacen.kardex');
      const res = await http().put('/administration/roles/2/permisos').send(body).expect(400);
      expect(res.body.message).toEqual(['Falta el módulo "almacen.kardex"']);
      expect(bd.transaction).not.toHaveBeenCalled();
    });

    it('módulo repetido → 400', async () => {
      const body = cuerpo();
      body.permisos.push({ clave: 'dashboard', ...NADA });
      const res = await http().put('/administration/roles/2/permisos').send(body).expect(400);
      expect(res.body.message).toEqual(['Módulo repetido: "dashboard"']);
    });

    it('clave desconocida → 400', async () => {
      const body = cuerpo();
      body.permisos.push({ clave: 'inventado', ...NADA });
      const res = await http().put('/administration/roles/2/permisos').send(body).expect(400);
      expect(res.body.message).toEqual(['Clave de módulo desconocida: "inventado"']);
    });

    it('un módulo inactivo cuenta como desconocido y no se exige', async () => {
      bd.estado.modulos[0].activo = false;
      const body = cuerpo();
      await http().put('/administration/roles/2/permisos').send(body).expect(200);
      body.permisos.push({ clave: 'dashboard', ...NADA });
      await http().put('/administration/roles/2/permisos').send(body).expect(400);
    });

    it('aprobar/anular en un módulo que no lo admite → 400', async () => {
      const res = await http()
        .put('/administration/roles/2/permisos')
        .send(cuerpo({ dashboard: { ver: true, aprobar: true }, 'tesoreria.cuentas': { ver: true, anular: true } }))
        .expect(400);
      expect(res.body.message).toEqual(['"dashboard" no admite Aprobar', '"tesoreria.cuentas" no admite Anular']);
      expect(bd.transaction).not.toHaveBeenCalled();
    });

    it('aprobar y anular donde el módulo los admite → 200', async () => {
      await http()
        .put('/administration/roles/2/permisos')
        .send(cuerpo({ 'documentos.administracion': { ver: true, aprobar: true, anular: true } }))
        .expect(200);
      expect(bd.estado.permisos.find((p) => p.modulo_id === id('documentos.administracion'))).toMatchObject({
        aprobar: true,
        anular: true,
      });
    });

    it.each(['crear', 'editar', 'eliminar'] as const)('%s sin Ver → 400', async (accion) => {
      const res = await http()
        .put('/administration/roles/2/permisos')
        .send(cuerpo({ 'almacen.stock': { [accion]: true } }))
        .expect(400);
      expect(res.body.message).toHaveLength(1);
      expect(res.body.message[0]).toMatch(/^"almacen\.stock": (Crear|Editar|Eliminar) requiere Ver$/);
    });

    it('aprobar sin Ver → 400', async () => {
      const res = await http()
        .put('/administration/roles/2/permisos')
        .send(cuerpo({ 'requerimientos.aprobacion': { aprobar: true } }))
        .expect(400);
      expect(res.body.message).toEqual(['"requerimientos.aprobacion": Aprobar requiere Ver']);
    });

    it('rol de sistema → 409 y no cambia nada', async () => {
      const res = await http().put('/administration/roles/1/permisos').send(cuerpo({}, BASICO)).expect(409);
      expect(res.body.message).toBe('El rol "Administrador" tiene todos los permisos y no se puede modificar');
      expect(bd.transaction).not.toHaveBeenCalled();
      expect(permisosRol.invalidarRol).not.toHaveBeenCalled();
    });

    it('rol inexistente → 404; id no numérico → 400', async () => {
      await http().put('/administration/roles/99/permisos').send(cuerpo()).expect(404);
      await http().put('/administration/roles/x/permisos').send(cuerpo()).expect(400);
    });

    it('si el rol desaparece antes de bloquearlo → 404 sin cambios', async () => {
      const antes = structuredClone(bd.estado.permisos);
      bd.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
        bd.estado.roles = bd.estado.roles.filter((r) => r.id !== 2);
        bd.estado.enTransaccion = true;
        try {
          return await fn({
            orm: {
              public: {
                rol: { where: () => ({ update: async () => null }) },
                rol_permiso: { where: () => ({ deleteAndCount: async () => 0 }), createAndCount: async () => 0 },
              },
            },
          });
        } finally {
          bd.estado.enTransaccion = false;
        }
      });
      await http().put('/administration/roles/2/permisos').send(cuerpo()).expect(404);
      expect(bd.estado.permisos).toEqual(antes);
    });

    it.each([
      ['sin permisos', {}],
      ['permisos no es arreglo', { permisos: 'x' }],
      ['entrada sin clave', { permisos: [{ ...NADA }] }],
      ['acción no booleana', { permisos: [{ clave: 'dashboard', ...NADA, ver: 'si' }] }],
      ['acción ausente', { permisos: [{ clave: 'dashboard', ver: false }] }],
    ])('cuerpo inválido (%s) → 400', async (_caso, body) => {
      await http().put('/administration/roles/2/permisos').send(body).expect(400);
      expect(bd.transaction).not.toHaveBeenCalled();
    });
  });
});
