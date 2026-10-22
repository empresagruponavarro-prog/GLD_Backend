import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Patch,
  Post,
  Put,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Database } from '../../prisma/prisma.module.js';
import type { EntradaAuditoriaPermisos } from './auditoria-permisos.js';
import { AuditoriaPermisosService } from './auditoria-permisos.js';
import type { AuthUser, RequestConUsuario } from './auth-user.js';
import { jwtModuleOptions } from './jwt.config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Accion, LecturaCompartida, Modulo, TambienDesde } from './permisos.decorator.js';
import { PermisosGuard, accionPorVerbo } from './permisos.guard.js';
import { leerModoPermisos } from './permisos-modo.js';
import { PERMISOS_ROL_CACHE_MS, PermisosRolService } from './permisos-rol.js';
import { Public } from './public.decorator.js';
import { SesionUsuariosService } from './sesion-usuarios.js';

// ---- Controladores de prueba (decorados como los reales) ----

@Controller('prueba/pagos')
@Modulo('tesoreria.pagos')
class PagosCtl {
  @Get() listar() {}
  @Get(':id') detalle() {}
  @Post() crear() {}
  @Patch(':id') editar() {}
  @Put(':id') reemplazar() {}
  @Delete(':id') borrar() {}
  @Accion('anular') @Post(':id/anular') anular() {}
  @LecturaCompartida() @Get('select') select() {}
  @Public() @Get('salud') salud() {}
}

@Controller('prueba/sin-modulo')
class SinModuloCtl {
  @Get() algo() {}
}

@Controller('prueba/catalogo')
@LecturaCompartida()
class CompartidoCtl {
  @Get() algo() {}
}

@Controller('administration/usuarios')
@Modulo('admin.usuarios')
class UsuariosCtl {
  @Get() listar() {}
}

@Controller('prueba/stock')
@Modulo('almacen.stock')
class StockCtl {
  @Get() listar() {}
}

/** Agenda de programación que también usa la pantalla de pagos (`@TambienDesde`). */
@Controller('prueba/agenda')
@Modulo('tesoreria.programacion')
class AgendaCtl {
  @TambienDesde('tesoreria.pagos', 'almacen.stock') @Get() agenda() {}
  @TambienDesde('tesoreria.pagos') @Post() programar() {}
  @Get('pendientes') pendientes() {}
}

@Controller('administration/usuarios-alt')
@Modulo('admin.usuarios')
class UsuariosAltCtl {
  @TambienDesde('tesoreria.programacion') @Get() listar() {}
}

// ---- BD en memoria (lo que leen PermisosRolService y SesionUsuariosService) ----

type Fila = { ver: boolean; crear: boolean; editar: boolean; eliminar: boolean; aprobar: boolean; anular: boolean };
const NADA: Fila = { ver: false, crear: false, editar: false, eliminar: false, aprobar: false, anular: false };
const TODO: Fila = { ver: true, crear: true, editar: true, eliminar: true, aprobar: true, anular: true };

const bd = {
  roles: [] as { id: number; nombre: string; es_sistema: boolean }[],
  modulos: [] as {
    id: number;
    clave: string;
    nombre: string;
    grupo: string;
    ruta: string | null;
    orden: number;
    admite_aprobar: boolean;
    admite_anular: boolean;
    activo: boolean;
  }[],
  permisos: [] as ({ rol_id: number; modulo_id: number } & Fila)[],
  usuarios: [] as { IdUsuario: string; Rol: string | null; activo: boolean; id_area: number | null }[],
  /** Excepciones por usuario (`usuario_permiso`). */
  excepciones: [] as ({ usuario_id: string; modulo_id: number } & Fila)[],
  /** Módulos habilitados por área (`area_modulo`). */
  areaModulos: [] as { area_id: number; modulo_id: number; solo_lectura: boolean }[],
};

function sembrar() {
  bd.roles = [
    { id: 1, nombre: 'Administrador', es_sistema: true },
    { id: 2, nombre: 'Limitado', es_sistema: false },
    { id: 3, nombre: 'Parcial', es_sistema: false },
    { id: 4, nombre: 'Completo', es_sistema: false },
    { id: 5, nombre: 'Programador', es_sistema: false },
    { id: 6, nombre: 'SoloStock', es_sistema: false },
  ];
  const m = (id: number, clave: string, nombre: string, grupo: string, over: Partial<(typeof bd.modulos)[number]> = {}) => ({
    id,
    clave,
    nombre,
    grupo,
    ruta: null,
    orden: id,
    admite_aprobar: false,
    admite_anular: false,
    activo: true,
    ...over,
  });
  bd.modulos = [
    m(10, 'tesoreria.pagos', 'Ejecución de pagos', 'Tesorería', { admite_anular: true }),
    m(11, 'tesoreria.programacion', 'Programación de pagos', 'Tesorería', { admite_anular: true }),
    m(14, 'almacen.stock', 'Stock actual', 'Almacén', { activo: false }),
    m(32, 'admin.usuarios', 'Usuarios', 'Administración'),
  ];
  bd.permisos = [
    { rol_id: 3, modulo_id: 10, ...NADA, ver: true, editar: true },
    { rol_id: 4, modulo_id: 10, ...TODO },
    { rol_id: 4, modulo_id: 14, ...TODO },
    { rol_id: 4, modulo_id: 32, ...TODO },
    { rol_id: 5, modulo_id: 11, ...NADA, ver: true },
    { rol_id: 6, modulo_id: 14, ...TODO },
  ];
  bd.usuarios = [{ IdUsuario: 'U1', Rol: 'Limitado', activo: true, id_area: null }];
  bd.excepciones = [];
  bd.areaModulos = [];
}

const rolFirst = vi.fn(async ({ nombre }: { nombre: string }) => bd.roles.find((r) => r.nombre === nombre) ?? null);
const dbFalsa = {
  orm: {
    public: {
      rol: { first: rolFirst },
      modulo: { orderBy: () => ({ all: async () => bd.modulos.map((x) => ({ ...x })) }) },
      rol_permiso: {
        where: ({ rol_id }: { rol_id: number }) => ({
          all: async () => bd.permisos.filter((p) => p.rol_id === rol_id).map((p) => ({ ...p })),
        }),
      },
      Usuarios: {
        first: async ({ IdUsuario }: { IdUsuario: string }) => bd.usuarios.find((u) => u.IdUsuario === IdUsuario) ?? null,
      },
      usuario_permiso: {
        where: ({ usuario_id }: { usuario_id: string }) => ({
          all: async () => bd.excepciones.filter((p) => p.usuario_id === usuario_id).map((p) => ({ ...p })),
        }),
      },
      area_modulo: {
        where: ({ area_id }: { area_id: number }) => ({
          all: async () => bd.areaModulos.filter((p) => p.area_id === area_id).map((p) => ({ ...p })),
        }),
      },
    },
  },
} as unknown as Database;

// ---- Helpers ----

type Clase = new () => object;

function ctx(clase: Clase, metodo: string, verbo: string, user?: AuthUser): ExecutionContext {
  const handler = (clase.prototype as Record<string, () => void>)[metodo];
  const request: RequestConUsuario & { method: string } = { headers: {}, method: verbo, user };
  return {
    getHandler: () => handler,
    getClass: () => clase,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const usuario = (rol: string, id = 'U-TEST'): AuthUser => ({ id, usuario: id.toLowerCase(), rol });

describe('PermisosGuard', () => {
  const modoAnterior = process.env['PERMISOS_MODO'];
  const registrar = vi.fn<(e: EntradaAuditoriaPermisos) => void>();
  const auditoria = { registrar } as unknown as AuditoriaPermisosService;
  let permisosRol: PermisosRolService;

  /** Guard nuevo con `PERMISOS_MODO` = `modo` (`undefined` = variable ausente). */
  const crearGuard = (modo?: string) => {
    if (modo === undefined) delete process.env['PERMISOS_MODO'];
    else process.env['PERMISOS_MODO'] = modo;
    return new PermisosGuard(new Reflector(), permisosRol, auditoria);
  };
  /** Ejecuta el guard y devuelve `true` o el error lanzado. */
  const evaluar = (guard: PermisosGuard, c: ExecutionContext) => guard.canActivate(c).catch((e: unknown) => e);

  beforeEach(() => {
    sembrar();
    rolFirst.mockClear();
    registrar.mockClear();
    permisosRol = new PermisosRolService(dbFalsa);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (modoAnterior === undefined) delete process.env['PERMISOS_MODO'];
    else process.env['PERMISOS_MODO'] = modoAnterior;
  });

  describe('orden de evaluación', () => {
    it('@Public pasa sin usuario y sin leer permisos', async () => {
      const guard = crearGuard('estricto');
      await expect(guard.canActivate(ctx(PagosCtl, 'salud', 'GET'))).resolves.toBe(true);
      expect(rolFirst).not.toHaveBeenCalled();
    });

    it('sin request.user (no debería pasar tras JwtAuthGuard) → 401', async () => {
      const guard = crearGuard('estricto');
      await expect(guard.canActivate(ctx(PagosCtl, 'listar', 'GET'))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('Administrador (rol de sistema) pasa en todo, incluso sin @Modulo o en un módulo inactivo', async () => {
      const guard = crearGuard('estricto');
      const admin = usuario('Administrador');
      for (const [clase, metodo, verbo] of [
        [PagosCtl, 'anular', 'POST'],
        [PagosCtl, 'borrar', 'DELETE'],
        [SinModuloCtl, 'algo', 'GET'],
        [StockCtl, 'listar', 'GET'],
        [UsuariosCtl, 'listar', 'GET'],
      ] as const) {
        await expect(guard.canActivate(ctx(clase, metodo, verbo, admin))).resolves.toBe(true);
      }
      expect(registrar).not.toHaveBeenCalled();
    });

    it('@LecturaCompartida (método o clase) solo exige sesión', async () => {
      const guard = crearGuard('estricto');
      const limitado = usuario('Limitado');
      await expect(guard.canActivate(ctx(PagosCtl, 'select', 'GET', limitado))).resolves.toBe(true);
      await expect(guard.canActivate(ctx(CompartidoCtl, 'algo', 'GET', limitado))).resolves.toBe(true);
      expect(registrar).not.toHaveBeenCalled();
      expect(rolFirst).not.toHaveBeenCalled();
    });

    it('sin @Modulo en la clase → 403 RUTA_SIN_MODULO, también en modo auditoría, y log de error', async () => {
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      for (const modo of ['auditoria', 'estricto']) {
        const guard = crearGuard(modo);
        const e = await evaluar(guard, ctx(SinModuloCtl, 'algo', 'GET', usuario('Completo')));
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).getResponse()).toMatchObject({ statusCode: 403, codigo: 'RUTA_SIN_MODULO' });
      }
      expect(error).toHaveBeenCalledWith(expect.stringContaining('SinModuloCtl.algo'));
    });
  });

  describe('acción', () => {
    it.each([
      ['GET', 'ver'],
      ['HEAD', 'ver'],
      ['get', 'ver'],
      ['POST', 'crear'],
      ['PUT', 'editar'],
      ['PATCH', 'editar'],
      ['DELETE', 'eliminar'],
    ])('accionPorVerbo(%s) = %s', (verbo, accion) => {
      expect(accionPorVerbo(verbo)).toBe(accion);
    });

    it('accionPorVerbo de un verbo sin acción → undefined', () => {
      expect(accionPorVerbo('OPTIONS')).toBeUndefined();
    });

    it.each([
      ['listar', 'GET', true, 'ver'],
      ['detalle', 'GET', true, 'ver'],
      ['crear', 'POST', false, 'crear'],
      ['editar', 'PATCH', true, 'editar'],
      ['reemplazar', 'PUT', true, 'editar'],
      ['borrar', 'DELETE', false, 'eliminar'],
    ])('verbo → acción: %s (%s) con ver+editar → permitido=%s (%s)', async (metodo, verbo, permitido, accion) => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const guard = crearGuard('estricto');
      const r = await evaluar(guard, ctx(PagosCtl, metodo, verbo, usuario('Parcial')));
      if (permitido) {
        expect(r).toBe(true);
      } else {
        expect(r).toBeInstanceOf(ForbiddenException);
        expect((r as ForbiddenException).getResponse()).toMatchObject({ accion });
      }
    });

    it('@Accion especial manda sobre el verbo: POST :id/anular exige anular, no crear', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const guard = crearGuard('estricto');
      bd.permisos.push({ rol_id: 2, modulo_id: 10, ...NADA, ver: true, crear: true });
      const e = await evaluar(guard, ctx(PagosCtl, 'anular', 'POST', usuario('Limitado')));
      expect((e as ForbiddenException).getResponse()).toMatchObject({ accion: 'anular', modulo: 'tesoreria.pagos' });
      await expect(guard.canActivate(ctx(PagosCtl, 'anular', 'POST', usuario('Completo')))).resolves.toBe(true);
    });

    it('anular se recorta si el módulo no lo admite (aunque la fila lo tenga)', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const pagos = bd.modulos.find((m) => m.clave === 'tesoreria.pagos');
      if (pagos) pagos.admite_anular = false;
      const guard = crearGuard('estricto');
      await expect(guard.canActivate(ctx(PagosCtl, 'anular', 'POST', usuario('Completo')))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('módulo inactivo → negado aunque el rol tenga todo', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const guard = crearGuard('estricto');
      const e = await evaluar(guard, ctx(StockCtl, 'listar', 'GET', usuario('Completo')));
      expect((e as ForbiddenException).getResponse()).toMatchObject({ modulo: 'almacen.stock', accion: 'ver' });
    });

    it('usuario sin rol o con un rol que no existe → todo negado', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const guard = crearGuard('estricto');
      await expect(guard.canActivate(ctx(PagosCtl, 'listar', 'GET', usuario('')))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(guard.canActivate(ctx(PagosCtl, 'listar', 'GET', usuario('Fantasma')))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('@TambienDesde (con acceso a la pantalla basta)', () => {
    beforeEach(() => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    it('la acción en el módulo principal basta (sin registro)', async () => {
      const guard = crearGuard('estricto');
      await expect(guard.canActivate(ctx(AgendaCtl, 'agenda', 'GET', usuario('Programador')))).resolves.toBe(true);
      expect(registrar).not.toHaveBeenCalled();
    });

    it('la MISMA acción en un módulo alternativo activo basta (sin registro)', async () => {
      const guard = crearGuard('estricto');
      // Parcial: ver+editar en tesoreria.pagos, nada en tesoreria.programacion.
      await expect(guard.canActivate(ctx(AgendaCtl, 'agenda', 'GET', usuario('Parcial')))).resolves.toBe(true);
      await expect(guard.canActivate(ctx(AgendaCtl, 'programar', 'POST', usuario('Completo')))).resolves.toBe(true);
      expect(registrar).not.toHaveBeenCalled();
    });

    it('otra acción en el alternativo no cuenta: POST exige crear también allí', async () => {
      const guard = crearGuard('estricto');
      const e = await evaluar(guard, ctx(AgendaCtl, 'programar', 'POST', usuario('Parcial')));
      expect((e as ForbiddenException).getResponse()).toMatchObject({ codigo: 'SIN_PERMISO', modulo: 'tesoreria.programacion', accion: 'crear' });
    });

    it('sin la acción en ninguno → negativa registrada con el módulo PRINCIPAL', async () => {
      const guard = crearGuard('estricto');
      const e = await evaluar(guard, ctx(AgendaCtl, 'agenda', 'GET', usuario('Limitado', 'USR-0007')));
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        message: 'No tienes permiso para ver en Programación de pagos',
        error: 'Forbidden',
        codigo: 'SIN_PERMISO',
        modulo: 'tesoreria.programacion',
        accion: 'ver',
      });
      expect(registrar).toHaveBeenCalledTimes(1);
      expect(registrar).toHaveBeenCalledWith(
        expect.objectContaining({ aplicado: true, usuario: 'USR-0007', modulo: 'tesoreria.programacion', ruta: '/prueba/agenda' }),
      );
    });

    it('en auditoría, sin la acción en ninguno: deja pasar y registra (aplicado: false)', async () => {
      const guard = crearGuard('auditoria');
      await expect(guard.canActivate(ctx(AgendaCtl, 'agenda', 'GET', usuario('Limitado')))).resolves.toBe(true);
      expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ aplicado: false, modulo: 'tesoreria.programacion' }));
    });

    it('un módulo alternativo INACTIVO no cuenta', async () => {
      const guard = crearGuard('estricto');
      // SoloStock tiene todo en almacen.stock, que está inactivo.
      const e = await evaluar(guard, ctx(AgendaCtl, 'agenda', 'GET', usuario('SoloStock')));
      expect((e as ForbiddenException).getResponse()).toMatchObject({ modulo: 'tesoreria.programacion', accion: 'ver' });
    });

    it('un método SIN @TambienDesde de la misma clase no hereda los alternativos', async () => {
      const guard = crearGuard('estricto');
      const e = await evaluar(guard, ctx(AgendaCtl, 'pendientes', 'GET', usuario('Parcial')));
      expect((e as ForbiddenException).getResponse()).toMatchObject({ modulo: 'tesoreria.programacion', accion: 'ver' });
    });

    it('Administración sigue estricta aun en auditoría (negativa aplicada con el módulo principal)', async () => {
      const guard = crearGuard('auditoria');
      const e = await evaluar(guard, ctx(UsuariosAltCtl, 'listar', 'GET', usuario('Limitado')));
      expect((e as ForbiddenException).getResponse()).toMatchObject({ codigo: 'SIN_PERMISO', modulo: 'admin.usuarios', accion: 'ver' });
      expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ modo: 'auditoria', aplicado: true, modulo: 'admin.usuarios' }));
    });
  });

  describe('modo', () => {
    it('auditoría (por defecto): deja pasar, registra la negativa (aplicado: false) y avisa en el log', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const guard = crearGuard(undefined);
      expect(guard.modo).toBe('auditoria');
      await expect(guard.canActivate(ctx(PagosCtl, 'detalle', 'GET', usuario('Limitado', 'USR-0042')))).resolves.toBe(true);
      expect(registrar).toHaveBeenCalledTimes(1);
      const entrada = registrar.mock.calls[0][0];
      expect(entrada).toEqual({
        fecha: expect.any(String),
        modo: 'auditoria',
        aplicado: false,
        usuario: 'USR-0042',
        rol: 'Limitado',
        modulo: 'tesoreria.pagos',
        accion: 'ver',
        metodo: 'GET',
        // Ruta declarada: sin ids ni query.
        ruta: '/prueba/pagos/:id',
        controlador: 'PagosCtl',
        handler: 'detalle',
      });
      expect(Number.isNaN(Date.parse(entrada.fecha))).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('tesoreria.pagos'));
    });

    it('estricto: 403 con el cuerpo exacto y registro aplicado: true', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const guard = crearGuard('estricto');
      const e = await evaluar(guard, ctx(PagosCtl, 'crear', 'POST', usuario('Limitado')));
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getStatus()).toBe(403);
      expect((e as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        message: 'No tienes permiso para crear en Ejecución de pagos',
        error: 'Forbidden',
        codigo: 'SIN_PERMISO',
        modulo: 'tesoreria.pagos',
        accion: 'crear',
      });
      expect(registrar).toHaveBeenCalledWith(
        expect.objectContaining({ modo: 'estricto', aplicado: true, ruta: '/prueba/pagos', metodo: 'POST' }),
      );
    });

    it('el grupo Administración se aplica en estricto aun en modo auditoría', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const guard = crearGuard('auditoria');
      const e = await evaluar(guard, ctx(UsuariosCtl, 'listar', 'GET', usuario('Limitado')));
      expect((e as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        message: 'No tienes permiso para ver en Usuarios',
        error: 'Forbidden',
        codigo: 'SIN_PERMISO',
        modulo: 'admin.usuarios',
        accion: 'ver',
      });
      expect(registrar).toHaveBeenCalledWith(
        expect.objectContaining({ modo: 'auditoria', aplicado: true, modulo: 'admin.usuarios', ruta: '/administration/usuarios' }),
      );
      // Con el permiso guardado, pasa.
      await expect(guard.canActivate(ctx(UsuariosCtl, 'listar', 'GET', usuario('Completo')))).resolves.toBe(true);
    });

    it('permitido: no registra nada', async () => {
      const guard = crearGuard('auditoria');
      await expect(guard.canActivate(ctx(PagosCtl, 'listar', 'GET', usuario('Parcial')))).resolves.toBe(true);
      expect(registrar).not.toHaveBeenCalled();
    });

    it.each([
      [undefined, 'auditoria', null],
      ['', 'auditoria', null],
      ['auditoria', 'auditoria', null],
      ['estricto', 'estricto', null],
      [' ESTRICTO ', 'estricto', null],
      ['bloquear', 'auditoria', 'bloquear'],
    ])('PERMISOS_MODO=%j → %s (inválido: %j)', (valor, modo, invalido) => {
      expect(leerModoPermisos(valor === undefined ? {} : { PERMISOS_MODO: valor })).toEqual({ modo, invalido });
    });

    it('al arrancar avisa del modo efectivo; con un valor inválido avisa y usa auditoría', () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const guard = crearGuard('bloquear');
      expect(guard.modo).toBe('auditoria');
      guard.onModuleInit();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('PERMISOS_MODO="bloquear" no es válido'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('AUDITORÍA'));

      warn.mockClear();
      crearGuard('estricto').onModuleInit();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ESTRICTO'));
    });
  });

  describe('caché por rol (30 s)', () => {
    const negado = async (guard: PermisosGuard, rol: string) =>
      (await evaluar(guard, ctx(PagosCtl, 'crear', 'POST', usuario(rol)))) instanceof ForbiddenException;

    beforeEach(() => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    it('lee la BD una vez por rol dentro de la ventana y vuelve a leer al vencer', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
      const guard = crearGuard('estricto');
      expect(await negado(guard, 'Limitado')).toBe(true);
      expect(await negado(guard, 'Limitado')).toBe(true);
      expect(rolFirst).toHaveBeenCalledTimes(1);

      // Un cambio hecho por fuera (sin invalidar) no se ve dentro de la ventana...
      bd.permisos.push({ rol_id: 2, modulo_id: 10, ...TODO });
      vi.setSystemTime(Date.now() + PERMISOS_ROL_CACHE_MS - 1);
      expect(await negado(guard, 'Limitado')).toBe(true);
      // ...y sí al vencer.
      vi.setSystemTime(Date.now() + 2);
      expect(await negado(guard, 'Limitado')).toBe(false);
      expect(rolFirst).toHaveBeenCalledTimes(2);
      expect(PERMISOS_ROL_CACHE_MS).toBe(30_000);
    });

    it('PUT de la matriz (invalidarRol) se aplica de inmediato solo para ese rol', async () => {
      const guard = crearGuard('estricto');
      expect(await negado(guard, 'Limitado')).toBe(true);
      expect(await negado(guard, 'Parcial')).toBe(true);
      bd.permisos.push({ rol_id: 2, modulo_id: 10, ...TODO });
      bd.permisos.find((p) => p.rol_id === 3 && p.modulo_id === 10)!.crear = true;
      permisosRol.invalidarRol('Limitado');
      expect(await negado(guard, 'Limitado')).toBe(false);
      // Parcial sigue con su caché.
      expect(await negado(guard, 'Parcial')).toBe(true);
    });

    it('renombrar el rol (invalidarTodo): el nombre nuevo tiene los permisos y el viejo ya no', async () => {
      const guard = crearGuard('estricto');
      expect(await negado(guard, 'Completo')).toBe(false);
      bd.roles.find((r) => r.nombre === 'Completo')!.nombre = 'Completo 2';
      permisosRol.invalidarTodo();
      expect(await negado(guard, 'Completo')).toBe(true);
      expect(await negado(guard, 'Completo 2')).toBe(false);
    });

    it('borrar el rol (invalidarRol) deja sin permisos a quien aún lo tuviera', async () => {
      const guard = crearGuard('estricto');
      expect(await negado(guard, 'Completo')).toBe(false);
      bd.roles = bd.roles.filter((r) => r.nombre !== 'Completo');
      permisosRol.invalidarRol('Completo');
      expect(await negado(guard, 'Completo')).toBe(true);
    });

    it('una lectura en curso al invalidar no deja en la caché el valor viejo', async () => {
      let liberar: () => void = () => undefined;
      rolFirst.mockImplementationOnce(({ nombre }: { nombre: string }) => {
        const viejo = bd.roles.find((r) => r.nombre === nombre) ?? null;
        return new Promise((resolve) => {
          liberar = () => resolve(viejo);
        });
      });
      const enCurso = permisosRol.obtener('Limitado');
      bd.permisos.push({ rol_id: 2, modulo_id: 10, ...TODO });
      permisosRol.invalidarRol('Limitado');
      liberar();
      await enCurso;
      const despues = await permisosRol.obtener('Limitado');
      expect(despues.modulos.get('tesoreria.pagos')?.permisos.crear).toBe(true);
      expect(rolFirst).toHaveBeenCalledTimes(2);
    });

    it('cambio de rol de un usuario: JwtAuthGuard relee el rol (sesiones.invalidar) y aplica los permisos del nuevo', async () => {
      const jwt = new JwtService(jwtModuleOptions({ JWT_SECRET: 'k'.repeat(64) }));
      const sesiones = new SesionUsuariosService(dbFalsa);
      const jwtGuard = new JwtAuthGuard(jwt, new Reflector(), sesiones);
      const guard = crearGuard('estricto');
      const token = await jwt.signAsync({ sub: 'U1', usuario: 'u1', rol: 'Completo' });

      const peticion = async () => {
        const c = ctx(PagosCtl, 'crear', 'POST');
        const req = c.switchToHttp().getRequest<RequestConUsuario>();
        req.headers = { authorization: `Bearer ${token}` };
        await jwtGuard.canActivate(c);
        return evaluar(guard, c);
      };

      // El token dice "Completo" pero manda el rol de la BD (Limitado).
      expect(await peticion()).toBeInstanceOf(ForbiddenException);
      bd.usuarios[0].Rol = 'Completo';
      sesiones.invalidar('U1');
      expect(await peticion()).toBe(true);
    });
  });

  describe('área y excepciones por usuario (plan 08)', () => {
    const AREA = 7;
    const conArea = (rol: string, idArea: number | null, id = 'U-AREA'): AuthUser => ({ ...usuario(rol, id), id_area: idArea });
    const permitido = async (guard: PermisosGuard, clase: Clase, metodo: string, verbo: string, user: AuthUser) =>
      (await evaluar(guard, ctx(clase, metodo, verbo, user))) === true;

    it('un área sin módulos configurados no restringe a sus usuarios', async () => {
      const guard = crearGuard('estricto');
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', conArea('Completo', AREA))).toBe(true);
    });

    it('con el área configurada, un módulo sin fila queda sin acceso aunque el rol lo dé', async () => {
      bd.areaModulos = [{ area_id: AREA, modulo_id: 11, solo_lectura: false }];
      const guard = crearGuard('estricto');
      const error = await evaluar(guard, ctx(PagosCtl, 'listar', 'GET', conArea('Completo', AREA)));
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ modulo: 'tesoreria.pagos', accion: 'ver', aplicado: true }));
    });

    it('módulo en "solo ver": puede consultar pero no crear, editar ni anular', async () => {
      bd.areaModulos = [{ area_id: AREA, modulo_id: 10, solo_lectura: true }];
      const guard = crearGuard('estricto');
      const persona = conArea('Completo', AREA);
      expect(await permitido(guard, PagosCtl, 'listar', 'GET', persona)).toBe(true);
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(false);
      expect(await permitido(guard, PagosCtl, 'editar', 'PATCH', persona)).toBe(false);
      expect(await permitido(guard, PagosCtl, 'anular', 'POST', persona)).toBe(false);
    });

    it('módulo "completo": rige lo que da el rol', async () => {
      bd.areaModulos = [{ area_id: AREA, modulo_id: 10, solo_lectura: false }];
      const guard = crearGuard('estricto');
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', conArea('Completo', AREA))).toBe(true);
      // Un rol con menos acciones sigue limitado por su rol, no por el área.
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', conArea('Parcial', AREA))).toBe(false);
    });

    it('Administración no depende del área: solo del rol', async () => {
      bd.areaModulos = [{ area_id: AREA, modulo_id: 10, solo_lectura: false }];
      const guard = crearGuard('estricto');
      expect(await permitido(guard, UsuariosCtl, 'listar', 'GET', conArea('Completo', AREA))).toBe(true);
    });

    it('sin área (alcance global) no se filtra, aunque otras áreas estén configuradas', async () => {
      bd.areaModulos = [{ area_id: AREA, modulo_id: 11, solo_lectura: false }];
      const guard = crearGuard('estricto');
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', conArea('Completo', null))).toBe(true);
    });

    it('el Administrador ignora el área y las excepciones', async () => {
      bd.areaModulos = [{ area_id: AREA, modulo_id: 11, solo_lectura: false }];
      bd.excepciones = [{ usuario_id: 'U-AREA', modulo_id: 10, ...NADA }];
      const guard = crearGuard('estricto');
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', conArea('Administrador', AREA))).toBe(true);
    });

    it('excepción que CONCEDE: el usuario accede a lo que su rol no da', async () => {
      bd.excepciones = [{ usuario_id: 'U-AREA', modulo_id: 10, ...NADA, ver: true, crear: true }];
      const guard = crearGuard('estricto');
      const persona = conArea('Limitado', null);
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(true);
      expect(await permitido(guard, PagosCtl, 'borrar', 'DELETE', persona)).toBe(false);
      // Otro usuario del mismo rol no la tiene.
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', conArea('Limitado', null, 'U-OTRO'))).toBe(false);
    });

    it('excepción que QUITA: reemplaza solo ese módulo y los demás conservan lo del rol', async () => {
      bd.excepciones = [{ usuario_id: 'U-AREA', modulo_id: 10, ...NADA, ver: true }];
      const guard = crearGuard('estricto');
      const persona = conArea('Completo', null);
      expect(await permitido(guard, PagosCtl, 'listar', 'GET', persona)).toBe(true);
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(false);
      expect(await permitido(guard, UsuariosCtl, 'listar', 'GET', persona)).toBe(true); // otro módulo: sigue el rol
    });

    it('la excepción gana al área: concede un módulo que el área no tiene', async () => {
      bd.areaModulos = [{ area_id: AREA, modulo_id: 11, solo_lectura: false }];
      bd.excepciones = [{ usuario_id: 'U-AREA', modulo_id: 10, ...TODO }];
      const guard = crearGuard('estricto');
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', conArea('Completo', AREA))).toBe(true);
    });

    it('una excepción sobre un módulo de Administración se ignora (nunca da acceso)', async () => {
      bd.excepciones = [{ usuario_id: 'U-AREA', modulo_id: 32, ...TODO }];
      const guard = crearGuard('estricto');
      expect(await permitido(guard, UsuariosCtl, 'listar', 'GET', conArea('Limitado', null))).toBe(false);
    });

    it('aprobar/anular de una excepción se recortan a lo que el módulo admite', async () => {
      bd.excepciones = [{ usuario_id: 'U-AREA', modulo_id: 14, ...TODO }];
      const permisos = await permisosRol.obtenerParaUsuario(conArea('Limitado', null));
      expect(permisos.modulos.get('almacen.stock')?.permisos).toEqual({
        ver: true, crear: true, editar: true, eliminar: true, aprobar: false, anular: false,
      });
    });

    it('cambiar los módulos del área (invalidarArea) se aplica de inmediato', async () => {
      bd.areaModulos = [{ area_id: AREA, modulo_id: 11, solo_lectura: false }];
      const guard = crearGuard('estricto');
      const persona = conArea('Completo', AREA);
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(false);
      bd.areaModulos = [{ area_id: AREA, modulo_id: 10, solo_lectura: false }];
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(false); // aún en caché (30 s)
      permisosRol.invalidarArea(AREA);
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(true);
    });

    it('cambiar las excepciones (invalidarUsuario) se aplica de inmediato', async () => {
      const guard = crearGuard('estricto');
      const persona = conArea('Limitado', null);
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(false);
      bd.excepciones = [{ usuario_id: 'U-AREA', modulo_id: 10, ...NADA, ver: true, crear: true }];
      permisosRol.invalidarUsuario('U-AREA');
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(true);
    });

    it('un cambio en la matriz del rol se refleja sin invalidar a los usuarios con excepciones', async () => {
      bd.excepciones = [{ usuario_id: 'U-AREA', modulo_id: 11, ...NADA, ver: true }];
      const guard = crearGuard('estricto');
      const persona = conArea('Limitado', null);
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(false);
      bd.permisos.push({ rol_id: 2, modulo_id: 10, ...TODO });
      permisosRol.invalidarRol('Limitado');
      expect(await permitido(guard, PagosCtl, 'crear', 'POST', persona)).toBe(true);
    });
  });
});

describe('AuditoriaPermisosService (archivo por defecto)', () => {
  it('escribe en logs/permisos-auditoria.jsonl bajo el directorio de trabajo', () => {
    expect(new AuditoriaPermisosService().archivo.replace(/\\/g, '/')).toMatch(/\/logs\/permisos-auditoria\.jsonl$/);
  });
});
