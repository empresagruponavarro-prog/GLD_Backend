import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { MODULO_KEY } from '../../../../platform/auth/decorators/permisos.decorator.js';
import { CLAVES_MODULO } from '../../../../platform/auth/permisos/permisos.js';
import type { PermisosRolService } from '../../../../platform/auth/permisos/permisos-rol.js';
import type { Database } from '../../../../prisma/prisma.module.js';
import { ActualizarModulosAreaDto } from './areas.dto.js';
import { AreasPermisosController } from './areas.controller.js';
import { AreasPermisosHandler } from './areas.handler.js';

interface AreaRow {
  id: number;
  codigo: string;
  nombre: string;
  estado: boolean;
}
interface AreaModuloRow {
  area_id: number;
  modulo_id: number;
  solo_lectura: boolean;
}

/** BD en memoria con la forma de la ORM que usa el handler; `transaction` deshace todo si el callback lanza. */
function crearBd() {
  const estado = {
    areas: [] as AreaRow[],
    modulos: [] as { id: number; clave: string; orden: number; activo: boolean }[],
    areaModulos: [] as AreaModuloRow[],
    usuarios: [] as { IdUsuario: string; activo: boolean; id_area: number | null }[],
    enTransaccion: false,
    fallarAlInsertar: false,
  };

  const areaModuloOrm = (dentroDeTx: boolean) => {
    const enTx = () => {
      if (!dentroDeTx || !estado.enTransaccion) throw new Error('area_modulo se reemplaza dentro de la transacción');
    };
    return {
      all: async () => estado.areaModulos.map((f) => ({ ...f })),
      where: ({ area_id }: { area_id: number }) => ({
        deleteAndCount: async () => {
          enTx();
          const antes = estado.areaModulos.length;
          estado.areaModulos = estado.areaModulos.filter((f) => f.area_id !== area_id);
          return antes - estado.areaModulos.length;
        },
      }),
      createAndCount: async (filas: AreaModuloRow[]) => {
        enTx();
        if (estado.fallarAlInsertar) throw new Error('fallo simulado');
        estado.areaModulos.push(...filas.map((f) => ({ ...f })));
        return filas.length;
      },
    };
  };
  const areaOrm = {
    first: async ({ id }: { id: number }) => estado.areas.find((a) => a.id === id) ?? null,
    orderBy: () => ({ all: async () => [...estado.areas].sort((a, b) => a.nombre.localeCompare(b.nombre)) }),
  };
  const moduloOrm = {
    where: ({ activo }: { activo: boolean }) => ({
      orderBy: () => ({
        all: async () =>
          estado.modulos
            .filter((m) => m.activo === activo)
            .map((m) => ({ ...m, nombre: `Módulo ${m.clave}`, grupo: 'G', ruta: null, admite_aprobar: false, admite_anular: false })),
      }),
    }),
  };
  const usuariosOrm = {
    where: ({ activo }: { activo: boolean }) => ({ all: async () => estado.usuarios.filter((u) => u.activo === activo) }),
  };

  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const copia = structuredClone(estado.areaModulos);
    estado.enTransaccion = true;
    try {
      return await fn({ orm: { public: { area_modulo: areaModuloOrm(true) } } });
    } catch (error) {
      estado.areaModulos = copia;
      throw error;
    } finally {
      estado.enTransaccion = false;
    }
  });

  const db = {
    transaction,
    orm: { public: { area: areaOrm, area_modulo: areaModuloOrm(false), modulo: moduloOrm, Usuarios: usuariosOrm } },
  } as unknown as Database;

  const sembrar = () => {
    estado.areas = [
      { id: 1, codigo: 'PROCURA', nombre: 'Procura', estado: true },
      { id: 2, codigo: 'ALMACEN', nombre: 'Almacén', estado: true },
      { id: 3, codigo: 'OFTEC', nombre: 'Oficina Técnica', estado: false },
    ];
    // El módulo 'almacen.stock' queda inactivo (no se muestra ni se puede habilitar).
    estado.modulos = CLAVES_MODULO.map((clave, i) => ({ id: i + 1, clave, orden: i + 1, activo: clave !== 'almacen.stock' }));
    estado.areaModulos = [];
    estado.usuarios = [
      { IdUsuario: 'U1', activo: true, id_area: 1 },
      { IdUsuario: 'U2', activo: true, id_area: 1 },
      { IdUsuario: 'U3', activo: false, id_area: 1 },
      { IdUsuario: 'U4', activo: true, id_area: 2 },
      { IdUsuario: 'U5', activo: true, id_area: null },
    ];
    estado.fallarAlInsertar = false;
  };
  return { estado, db, transaction, sembrar };
}

describe('módulos por área (plan 08)', () => {
  const bd = crearBd();
  const invalidarArea = vi.fn();
  const permisosRol = { invalidarArea } as unknown as PermisosRolService;
  let handler: AreasPermisosHandler;
  const modulo = (clave: string) => bd.estado.modulos.find((m) => m.clave === clave)?.id ?? -1;

  beforeEach(() => {
    bd.sembrar();
    bd.transaction.mockClear();
    invalidarArea.mockClear();
    handler = new AreasPermisosHandler(bd.db, permisosRol);
  });

  describe('GET matriz', () => {
    it('lista los módulos activos marcando los que no dependen del área, y las áreas sin configurar', async () => {
      const m = await handler.matriz();
      expect(m.modulos.map((x) => x.clave)).not.toContain('almacen.stock');
      const porClave = new Map(m.modulos.map((x) => [x.clave, x]));
      expect(porClave.get('tesoreria.pagos')?.configurable).toBe(true);
      for (const libre of ['admin.usuarios', 'admin.roles', 'admin.empresas', 'modulos']) {
        expect(porClave.get(libre)?.configurable).toBe(false);
      }
      expect(m.areas.map((a) => a.codigo)).toEqual(['ALMACEN', 'OFTEC', 'PROCURA']); // por nombre
      expect(m.areas.every((a) => !a.configurada && a.modulos.length === 0)).toBe(true);
    });

    it('cuenta solo los usuarios ACTIVOS de cada área', async () => {
      const m = await handler.matriz();
      expect(m.areas.find((a) => a.codigo === 'PROCURA')?.usuarios).toBe(2);
      expect(m.areas.find((a) => a.codigo === 'ALMACEN')?.usuarios).toBe(1);
      expect(m.areas.find((a) => a.codigo === 'OFTEC')?.usuarios).toBe(0);
    });

    it('sin_area trae los módulos configurables que ninguna área habilita', async () => {
      bd.estado.areaModulos = [
        { area_id: 1, modulo_id: modulo('requerimientos'), solo_lectura: false },
        { area_id: 2, modulo_id: modulo('tesoreria.pagos'), solo_lectura: true },
      ];
      const m = await handler.matriz();
      expect(m.sin_area).not.toContain('requerimientos');
      expect(m.sin_area).not.toContain('tesoreria.pagos');
      expect(m.sin_area).toContain('tesoreria.consulta');
      for (const libre of ['admin.usuarios', 'modulos']) expect(m.sin_area).not.toContain(libre);
      expect(m.areas.find((a) => a.codigo === 'ALMACEN')).toMatchObject({
        configurada: true,
        modulos: [{ clave: 'tesoreria.pagos', nivel: 'solo_ver' }],
      });
    });
  });

  describe('PUT módulos de un área', () => {
    it('guarda solo ver / completo, invalida la caché del área y devuelve el área ya guardada', async () => {
      const res = await handler.reemplazar(
        1,
        [
          { clave: 'requerimientos', nivel: 'completo' },
          { clave: 'almacen.consulta', nivel: 'solo_ver' },
        ],
        'ADM',
      );
      expect(bd.estado.areaModulos).toEqual([
        { area_id: 1, modulo_id: modulo('requerimientos'), solo_lectura: false },
        { area_id: 1, modulo_id: modulo('almacen.consulta'), solo_lectura: true },
      ]);
      expect(invalidarArea).toHaveBeenCalledWith(1);
      expect(res).toMatchObject({
        id: 1,
        configurada: true,
        modulos: [
          { clave: 'requerimientos', nivel: 'completo' },
          { clave: 'almacen.consulta', nivel: 'solo_ver' },
        ],
      });
    });

    it('reemplaza lo anterior y no toca los módulos de otras áreas', async () => {
      bd.estado.areaModulos = [
        { area_id: 1, modulo_id: modulo('requerimientos'), solo_lectura: false },
        { area_id: 2, modulo_id: modulo('tesoreria.pagos'), solo_lectura: false },
      ];
      await handler.reemplazar(1, [{ clave: 'documentos.origen', nivel: 'solo_ver' }], 'ADM');
      expect(bd.estado.areaModulos).toEqual([
        { area_id: 2, modulo_id: modulo('tesoreria.pagos'), solo_lectura: false },
        { area_id: 1, modulo_id: modulo('documentos.origen'), solo_lectura: true },
      ]);
    });

    it('con una lista vacía deja el área sin configurar (sin restricción)', async () => {
      bd.estado.areaModulos = [{ area_id: 1, modulo_id: modulo('requerimientos'), solo_lectura: false }];
      const res = await handler.reemplazar(1, [], 'ADM');
      expect(res).toMatchObject({ configurada: false, modulos: [] });
      expect(bd.estado.areaModulos).toEqual([]);
      expect(invalidarArea).toHaveBeenCalledWith(1);
    });

    it('área inexistente -> 404 y no toca nada', async () => {
      await expect(handler.reemplazar(99, [], 'ADM')).rejects.toBeInstanceOf(NotFoundException);
      expect(bd.transaction).not.toHaveBeenCalled();
      expect(invalidarArea).not.toHaveBeenCalled();
    });

    it.each([
      ['módulo desconocido', { clave: 'no.existe', nivel: 'completo' }, 'desconocido'],
      ['módulo inactivo', { clave: 'almacen.stock', nivel: 'completo' }, 'inactivo'],
      ['módulo de Administración', { clave: 'admin.usuarios', nivel: 'completo' }, 'no depende del área'],
      ['menú de módulos', { clave: 'modulos', nivel: 'solo_ver' }, 'no depende del área'],
    ] as const)('%s -> 400 y no guarda nada', async (_caso, entrada, texto) => {
      bd.estado.areaModulos = [{ area_id: 1, modulo_id: modulo('requerimientos'), solo_lectura: false }];
      const error: unknown = await handler.reemplazar(1, [{ clave: 'documentos.origen', nivel: 'completo' }, entrada], 'ADM').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify((error as BadRequestException).getResponse())).toContain(texto);
      expect(bd.estado.areaModulos).toHaveLength(1); // lo anterior sigue igual
      expect(invalidarArea).not.toHaveBeenCalled();
    });

    it('un módulo repetido -> 400', async () => {
      await expect(
        handler.reemplazar(
          1,
          [
            { clave: 'requerimientos', nivel: 'completo' },
            { clave: 'requerimientos', nivel: 'solo_ver' },
          ],
          'ADM',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('si falla el guardado deshace todo (lo anterior se conserva) y no invalida', async () => {
      bd.estado.areaModulos = [{ area_id: 1, modulo_id: modulo('requerimientos'), solo_lectura: false }];
      bd.estado.fallarAlInsertar = true;
      await expect(handler.reemplazar(1, [{ clave: 'documentos.origen', nivel: 'completo' }], 'ADM')).rejects.toThrow('fallo simulado');
      expect(bd.estado.areaModulos).toEqual([{ area_id: 1, modulo_id: modulo('requerimientos'), solo_lectura: false }]);
      expect(invalidarArea).not.toHaveBeenCalled();
    });
  });

  describe('validación y protección del endpoint', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const validar = (value: object) => pipe.transform(value, { type: 'body', metatype: ActualizarModulosAreaDto });

    it('acepta una lista de módulos con nivel solo_ver o completo (también vacía)', async () => {
      await expect(validar({ modulos: [] })).resolves.toBeInstanceOf(ActualizarModulosAreaDto);
      await expect(validar({ modulos: [{ clave: 'requerimientos', nivel: 'solo_ver' }] })).resolves.toBeInstanceOf(ActualizarModulosAreaDto);
    });

    it.each([
      ['sin lista', {}],
      ['lista que no es arreglo', { modulos: 'x' }],
      ['nivel no permitido', { modulos: [{ clave: 'requerimientos', nivel: 'no' }] }],
      ['clave vacía', { modulos: [{ clave: '', nivel: 'completo' }] }],
      ['más de 100 módulos', { modulos: Array.from({ length: 101 }, () => ({ clave: 'requerimientos', nivel: 'completo' })) }],
    ])('%s -> 400', async (_caso, body) => {
      await expect(validar(body)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el controller exige el permiso de Roles y permisos (admin.roles)', () => {
      expect(Reflect.getMetadata(MODULO_KEY, AreasPermisosController)).toBe('admin.roles');
    });
  });
});
