import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthUser } from '../../../../platform/auth/jwt/auth-user.js';
import { MODULO_KEY } from '../../../../platform/auth/decorators/permisos.decorator.js';
import { CLAVES_MODULO } from '../../../../platform/auth/permisos/permisos.js';
import type { PermisosRolService } from '../../../../platform/auth/permisos/permisos-rol.js';
import type { Database } from '../../../../prisma/prisma.module.js';
import { ActualizarExcepcionesDto } from './excepciones.dto.js';
import { ExcepcionesPermisosController } from './excepciones.controller.js';
import { NO_PROPIOS, SOLO_ADMINISTRADOR, ExcepcionesPermisosHandler } from './excepciones.handler.js';

interface Acciones {
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  aprobar: boolean;
  anular: boolean;
}
interface PermisoRow extends Acciones {
  usuario_id: string;
  modulo_id: number;
}
const NADA: Acciones = { ver: false, crear: false, editar: false, eliminar: false, aprobar: false, anular: false };
const BASICO: Acciones = { ver: true, crear: true, editar: true, eliminar: true, aprobar: false, anular: false };
const SOLO_VER: Acciones = { ...NADA, ver: true };

const APROBAR = new Set(['documentos.administracion', 'requerimientos.aprobacion']);
const ANULAR = new Set(['documentos.administracion', 'documentos.origen', 'tesoreria.pagos']);

/** Entrada del PUT para un módulo (por defecto todo en false). */
const entrada = (clave: string, acciones: Partial<Acciones> = {}) => ({ clave, ...NADA, ...acciones });

/** BD en memoria con la forma de la ORM que usa el handler; `transaction` deshace todo si el callback lanza. */
function crearBd() {
  const estado = {
    usuarios: [] as { IdUsuario: string; Nombres: string; Usuario: string; Rol: string; id_area: number | null }[],
    roles: [] as { id: number; nombre: string; es_sistema: boolean }[],
    modulos: [] as { id: number; clave: string; orden: number; activo: boolean; admite_aprobar: boolean; admite_anular: boolean }[],
    permisosRol: [] as ({ rol_id: number; modulo_id: number } & Acciones)[],
    areaModulos: [] as { area_id: number; modulo_id: number; solo_lectura: boolean }[],
    excepciones: [] as PermisoRow[],
    enTransaccion: false,
    fallarAlInsertar: false,
  };

  const excepcionesOrm = (dentroDeTx: boolean) => {
    const enTx = () => {
      if (!dentroDeTx || !estado.enTransaccion) throw new Error('usuario_permiso se reemplaza dentro de la transacción');
    };
    return {
      where: ({ usuario_id }: { usuario_id: string }) => ({
        all: async () => estado.excepciones.filter((p) => p.usuario_id === usuario_id).map((p) => ({ ...p })),
        deleteAndCount: async () => {
          const antes = estado.excepciones.length;
          estado.excepciones = estado.excepciones.filter((p) => p.usuario_id !== usuario_id);
          return antes - estado.excepciones.length;
        },
      }),
      createAndCount: async (filas: PermisoRow[]) => {
        enTx();
        if (estado.fallarAlInsertar) throw new Error('fallo simulado');
        estado.excepciones.push(...filas.map((f) => ({ ...f })));
        return filas.length;
      },
    };
  };

  const orm = (dentroDeTx: boolean) => ({
    Usuarios: { first: async ({ IdUsuario }: { IdUsuario: string }) => estado.usuarios.find((u) => u.IdUsuario === IdUsuario) ?? null },
    rol: { first: async ({ nombre }: { nombre: string }) => estado.roles.find((r) => r.nombre === nombre) ?? null },
    rol_permiso: {
      where: ({ rol_id }: { rol_id: number }) => ({
        all: async () => estado.permisosRol.filter((p) => p.rol_id === rol_id).map((p) => ({ ...p })),
      }),
    },
    area: { first: async ({ id }: { id: number }) => (id === 7 ? { id: 7, codigo: 'ALMACEN', nombre: 'Almacén' } : null) },
    area_modulo: {
      where: ({ area_id }: { area_id: number }) => ({
        all: async () => estado.areaModulos.filter((f) => f.area_id === area_id).map((f) => ({ ...f })),
      }),
    },
    modulo: {
      where: ({ activo }: { activo: boolean }) => ({
        orderBy: () => ({
          all: async () => estado.modulos.filter((m) => m.activo === activo).map((m) => ({ ...m, nombre: `Módulo ${m.clave}`, grupo: 'G', ruta: null })),
        }),
      }),
    },
    usuario_permiso: excepcionesOrm(dentroDeTx),
  });

  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const copia = structuredClone(estado.excepciones);
    estado.enTransaccion = true;
    try {
      return await fn({ orm: { public: orm(true) } });
    } catch (error) {
      estado.excepciones = copia;
      throw error;
    } finally {
      estado.enTransaccion = false;
    }
  });
  const db = { transaction, orm: { public: orm(false) } } as unknown as Database;

  const sembrar = () => {
    estado.roles = [
      { id: 1, nombre: 'Administrador', es_sistema: true },
      { id: 2, nombre: 'Usuario', es_sistema: false },
    ];
    // 'almacen.stock' queda inactivo.
    estado.modulos = CLAVES_MODULO.map((clave, i) => ({
      id: i + 1,
      clave,
      orden: i + 1,
      activo: clave !== 'almacen.stock',
      admite_aprobar: APROBAR.has(clave),
      admite_anular: ANULAR.has(clave),
    }));
    const id = (clave: string) => estado.modulos.find((m) => m.clave === clave)?.id ?? -1;
    // El rol "Usuario" da todo lo básico en requerimientos y solo ver en tesorería.pagos.
    estado.permisosRol = [
      { rol_id: 2, modulo_id: id('requerimientos'), ...BASICO },
      { rol_id: 2, modulo_id: id('tesoreria.pagos'), ...SOLO_VER },
      { rol_id: 2, modulo_id: id('almacen.consulta'), ...BASICO },
    ];
    estado.usuarios = [
      { IdUsuario: 'ADM', Nombres: 'Admin', Usuario: 'adm', Rol: 'Administrador', id_area: null },
      { IdUsuario: 'ADM2', Nombres: 'Otro Admin', Usuario: 'adm2', Rol: 'Administrador', id_area: null },
      { IdUsuario: 'U1', Nombres: 'Juan', Usuario: 'juan', Rol: 'Usuario', id_area: 7 },
      { IdUsuario: 'U2', Nombres: 'Ana', Usuario: 'ana', Rol: 'Usuario', id_area: null },
    ];
    estado.areaModulos = [];
    estado.excepciones = [];
    estado.fallarAlInsertar = false;
  };
  return { estado, db, transaction, sembrar, id: (clave: string) => estado.modulos.find((m) => m.clave === clave)?.id ?? -1 };
}

describe('excepciones de permisos por usuario (plan 08)', () => {
  const bd = crearBd();
  const invalidarUsuario = vi.fn();
  // Solo importa si el actor es Administrador.
  const permisosRol = {
    invalidarUsuario,
    obtener: async (rol: string) => ({ esAdministrador: rol === 'Administrador', modulos: new Map() }),
  } as unknown as PermisosRolService;
  let handler: ExcepcionesPermisosHandler;
  const admin: AuthUser = { id: 'ADM', usuario: 'adm', rol: 'Administrador' };
  const comun: AuthUser = { id: 'U2', usuario: 'ana', rol: 'Usuario' };

  beforeEach(() => {
    bd.sembrar();
    bd.transaction.mockClear();
    invalidarUsuario.mockClear();
    handler = new ExcepcionesPermisosHandler(bd.db, permisosRol);
  });

  describe('GET: permisos del usuario con su origen', () => {
    it('sin área ni excepciones todo viene del rol', async () => {
      const r = await handler.obtener('U2');
      expect(r).toMatchObject({ id_usuario: 'U2', rol: 'Usuario', area: null, area_configurada: false, es_administrador: false, personalizado: false });
      const req = r.modulos.find((m) => m.clave === 'requerimientos');
      expect(req).toMatchObject({ area: 'sin_restriccion', origen: 'rol', excepcion: null });
      expect(req?.efectivo).toEqual(BASICO);
      expect(r.modulos.map((m) => m.clave)).not.toContain('almacen.stock'); // inactivo
    });

    it('el área recorta: sin fila no ve, solo ver limita, completo deja lo del rol', async () => {
      bd.estado.areaModulos = [
        { area_id: 7, modulo_id: bd.id('almacen.consulta'), solo_lectura: true },
        { area_id: 7, modulo_id: bd.id('tesoreria.pagos'), solo_lectura: false },
      ];
      const r = await handler.obtener('U1');
      expect(r.area).toEqual({ id: 7, codigo: 'ALMACEN', nombre: 'Almacén' });
      expect(r.area_configurada).toBe(true);
      const de = (clave: string) => r.modulos.find((m) => m.clave === clave);
      expect(de('requerimientos')).toMatchObject({ area: 'no', origen: 'area', efectivo: NADA, rol: BASICO });
      expect(de('almacen.consulta')).toMatchObject({ area: 'solo_ver', origen: 'area', efectivo: SOLO_VER });
      expect(de('tesoreria.pagos')).toMatchObject({ area: 'completo', origen: 'rol', efectivo: SOLO_VER });
      // Administración no depende del área.
      expect(de('admin.usuarios')).toMatchObject({ area: 'sin_restriccion' });
    });

    it('la excepción gana: concede fuera del área y quita dentro de ella', async () => {
      bd.estado.areaModulos = [{ area_id: 7, modulo_id: bd.id('almacen.consulta'), solo_lectura: false }];
      bd.estado.excepciones = [
        { usuario_id: 'U1', modulo_id: bd.id('tesoreria.pagos'), ...BASICO },
        { usuario_id: 'U1', modulo_id: bd.id('almacen.consulta'), ...SOLO_VER },
      ];
      const r = await handler.obtener('U1');
      expect(r.personalizado).toBe(true);
      const de = (clave: string) => r.modulos.find((m) => m.clave === clave);
      expect(de('tesoreria.pagos')).toMatchObject({ area: 'no', origen: 'excepcion', excepcion: BASICO, efectivo: BASICO });
      expect(de('almacen.consulta')).toMatchObject({ area: 'completo', origen: 'excepcion', efectivo: SOLO_VER });
    });

    it('el Administrador lo tiene todo y no admite excepciones', async () => {
      const r = await handler.obtener('ADM');
      expect(r).toMatchObject({ es_administrador: true, personalizado: false });
      expect(r.modulos.every((m) => m.origen === 'rol' && m.efectivo.ver && m.excepcion === null)).toBe(true);
    });

    it('usuario inexistente -> 404', async () => {
      await expect(handler.obtener('NOPE')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('PUT: reemplazar las excepciones', () => {
    it('guarda las excepciones (incluida una que quita todo el acceso), invalida la caché y devuelve el resultado', async () => {
      const res = await handler.reemplazar(
        'U1',
        [entrada('tesoreria.pagos', { ver: true, crear: true }), entrada('requerimientos')],
        admin,
      );
      expect(bd.estado.excepciones).toEqual([
        { usuario_id: 'U1', modulo_id: bd.id('tesoreria.pagos'), ...NADA, ver: true, crear: true },
        { usuario_id: 'U1', modulo_id: bd.id('requerimientos'), ...NADA }, // todo en false = quitar el módulo
      ]);
      expect(invalidarUsuario).toHaveBeenCalledWith('U1');
      expect(res.personalizado).toBe(true);
      expect(res.modulos.find((m) => m.clave === 'requerimientos')).toMatchObject({ origen: 'excepcion', efectivo: NADA });
    });

    it('reemplaza las anteriores y no toca las de otros usuarios', async () => {
      bd.estado.excepciones = [
        { usuario_id: 'U1', modulo_id: bd.id('requerimientos'), ...SOLO_VER },
        { usuario_id: 'U2', modulo_id: bd.id('requerimientos'), ...SOLO_VER },
      ];
      await handler.reemplazar('U1', [entrada('tesoreria.pagos', { ver: true })], admin);
      expect(bd.estado.excepciones).toEqual([
        { usuario_id: 'U2', modulo_id: bd.id('requerimientos'), ...SOLO_VER },
        { usuario_id: 'U1', modulo_id: bd.id('tesoreria.pagos'), ...SOLO_VER },
      ]);
    });

    it('recorta nada a escondidas: aprobar/anular en un módulo que no los admite -> 400', async () => {
      const error: unknown = await handler
        .reemplazar('U1', [entrada('requerimientos', { ver: true, aprobar: true, anular: true })], admin)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify((error as BadRequestException).getResponse())).toContain('no admite Aprobar');
      expect(bd.estado.excepciones).toEqual([]);
    });

    it.each([
      ['módulo desconocido', entrada('no.existe', { ver: true }), 'desconocido'],
      ['módulo inactivo', entrada('almacen.stock', { ver: true }), 'inactivo'],
      ['módulo de Administración (escalada de privilegios)', entrada('admin.usuarios', { ver: true, crear: true }), 'Administración'],
      ['una acción sin Ver', entrada('requerimientos', { crear: true }), 'requiere Ver'],
    ])('%s -> 400 y no guarda nada', async (_caso, e, texto) => {
      bd.estado.excepciones = [{ usuario_id: 'U1', modulo_id: bd.id('requerimientos'), ...SOLO_VER }];
      const error: unknown = await handler.reemplazar('U1', [entrada('tesoreria.pagos', { ver: true }), e], admin).catch((x: unknown) => x);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify((error as BadRequestException).getResponse())).toContain(texto);
      expect(bd.estado.excepciones).toEqual([{ usuario_id: 'U1', modulo_id: bd.id('requerimientos'), ...SOLO_VER }]);
      expect(invalidarUsuario).not.toHaveBeenCalled();
    });

    it('un módulo repetido -> 400', async () => {
      await expect(
        handler.reemplazar('U1', [entrada('requerimientos', { ver: true }), entrada('requerimientos', { ver: true })], admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('si falla el guardado deshace todo y no invalida la caché', async () => {
      bd.estado.excepciones = [{ usuario_id: 'U1', modulo_id: bd.id('requerimientos'), ...SOLO_VER }];
      bd.estado.fallarAlInsertar = true;
      await expect(handler.reemplazar('U1', [entrada('tesoreria.pagos', { ver: true })], admin)).rejects.toThrow('fallo simulado');
      expect(bd.estado.excepciones).toEqual([{ usuario_id: 'U1', modulo_id: bd.id('requerimientos'), ...SOLO_VER }]);
      expect(invalidarUsuario).not.toHaveBeenCalled();
    });
  });

  describe('reglas de seguridad (PUT y DELETE)', () => {
    const intentos: [string, (actor: AuthUser, id: string) => Promise<unknown>][] = [
      ['reemplazar', (actor, id) => handler.reemplazar(id, [entrada('requerimientos', { ver: true })], actor)],
      ['restablecer', (actor, id) => handler.restablecer(id, actor)],
    ];

    it.each(intentos)('%s: quien no es Administrador recibe 403 y no cambia nada', async (_nombre, ejecutar) => {
      bd.estado.excepciones = [{ usuario_id: 'U1', modulo_id: bd.id('requerimientos'), ...SOLO_VER }];
      const error: unknown = await ejecutar(comun, 'U1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).message).toBe(SOLO_ADMINISTRADOR);
      expect(bd.estado.excepciones).toHaveLength(1);
      expect(invalidarUsuario).not.toHaveBeenCalled();
    });

    it.each(intentos)('%s: nadie modifica sus propios permisos (409)', async (_nombre, ejecutar) => {
      const error: unknown = await ejecutar(admin, 'ADM').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(NO_PROPIOS);
    });

    it.each(intentos)('%s: un usuario con rol Administrador no admite excepciones (409)', async (_nombre, ejecutar) => {
      await expect(ejecutar(admin, 'ADM2')).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(intentos)('%s: usuario inexistente -> 404', async (_nombre, ejecutar) => {
      await expect(ejecutar(admin, 'NOPE')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('restablecer quita todas las excepciones del usuario (y solo las suyas) e invalida la caché', async () => {
      bd.estado.excepciones = [
        { usuario_id: 'U1', modulo_id: bd.id('requerimientos'), ...SOLO_VER },
        { usuario_id: 'U1', modulo_id: bd.id('tesoreria.pagos'), ...BASICO },
        { usuario_id: 'U2', modulo_id: bd.id('requerimientos'), ...SOLO_VER },
      ];
      const res = await handler.restablecer('U1', admin);
      expect(bd.estado.excepciones).toEqual([{ usuario_id: 'U2', modulo_id: bd.id('requerimientos'), ...SOLO_VER }]);
      expect(invalidarUsuario).toHaveBeenCalledWith('U1');
      expect(res.personalizado).toBe(false);
    });
  });

  describe('validación y protección del endpoint', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const validar = (value: object) => pipe.transform(value, { type: 'body', metatype: ActualizarExcepcionesDto });

    it('acepta una lista de excepciones (también vacía)', async () => {
      await expect(validar({ excepciones: [] })).resolves.toBeInstanceOf(ActualizarExcepcionesDto);
      await expect(validar({ excepciones: [entrada('requerimientos', { ver: true })] })).resolves.toBeInstanceOf(ActualizarExcepcionesDto);
    });

    it.each([
      ['sin lista', {}],
      ['lista que no es arreglo', { excepciones: 'x' }],
      ['acción que no es booleana', { excepciones: [{ ...entrada('requerimientos'), ver: 'si' }] }],
      ['sin clave', { excepciones: [{ ...NADA }] }],
      ['más de 100 entradas', { excepciones: Array.from({ length: 101 }, () => entrada('requerimientos')) }],
    ])('%s -> 400', async (_caso, body) => {
      await expect(validar(body)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el controller se protege con el permiso de Usuarios (admin.usuarios)', () => {
      expect(Reflect.getMetadata(MODULO_KEY, ExcepcionesPermisosController)).toBe('admin.usuarios');
    });
  });
});
