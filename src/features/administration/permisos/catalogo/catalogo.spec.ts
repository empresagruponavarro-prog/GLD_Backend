import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MODULO_KEY } from '../../../../platform/auth/permisos.decorator.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import { CatalogoPermisosController } from './catalogo.controller.js';
import { CatalogoPermisosHandler } from './catalogo.handler.js';

interface ModuloRow {
  id: number;
  clave: string;
  nombre: string;
  grupo: string;
  ruta: string | null;
  orden: number;
  admite_aprobar: boolean;
  admite_anular: boolean;
  activo: boolean;
}

const m = (id: number, clave: string, grupo: string, orden: number, over: Partial<ModuloRow> = {}): ModuloRow => ({
  id,
  clave,
  nombre: `Nombre ${clave}`,
  grupo,
  ruta: `/${clave}`,
  orden,
  admite_aprobar: false,
  admite_anular: false,
  activo: true,
  ...over,
});

describe('GET /administration/permisos/catalogo', () => {
  let app: INestApplication;
  let modulos: ModuloRow[] = [];
  const where = vi.fn((filtro: { activo: boolean }) => ({
    // La BD ordena por `orden`; aquí se devuelve DESORDENADO para comprobar que el handler ordena igual.
    orderBy: () => ({ all: async () => modulos.filter((x) => x.activo === filtro.activo).reverse() }),
  }));
  const db = { orm: { public: { modulo: { where } } } } as unknown as Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogoPermisosController],
      providers: [CatalogoPermisosHandler, { provide: DB, useValue: db }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('pertenece al módulo admin.roles (Administración: siempre estricto)', () => {
    expect(Reflect.getMetadata(MODULO_KEY, CatalogoPermisosController)).toBe('admin.roles');
  });

  it('agrupa por grupo y ordena grupos y módulos por `orden`; solo módulos activos', async () => {
    modulos = [
      m(7, 'tesoreria.pagos', 'Tesorería', 10, { admite_anular: true }),
      m(1, 'dashboard', 'Navegación', 1, { ruta: null }),
      m(4, 'documentos.administracion', 'Documentos', 4, { admite_aprobar: true, admite_anular: true }),
      m(2, 'modulos', 'Navegación', 2),
      m(9, 'tesoreria.consulta', 'Tesorería', 8),
      m(30, 'admin.roles', 'Administración', 33, { activo: false }),
    ];
    const res = await request(app.getHttpServer()).get('/administration/permisos/catalogo').expect(200);

    expect(where).toHaveBeenCalledWith({ activo: true });
    expect(res.body.map((g: { grupo: string }) => g.grupo)).toEqual(['Navegación', 'Documentos', 'Tesorería']);
    expect(res.body[0]).toEqual({
      grupo: 'Navegación',
      modulos: [
        { id: 1, clave: 'dashboard', nombre: 'Nombre dashboard', ruta: null, orden: 1, admiteAprobar: false, admiteAnular: false },
        { id: 2, clave: 'modulos', nombre: 'Nombre modulos', ruta: '/modulos', orden: 2, admiteAprobar: false, admiteAnular: false },
      ],
    });
    expect(res.body[1].modulos[0]).toMatchObject({ clave: 'documentos.administracion', admiteAprobar: true, admiteAnular: true });
    expect(res.body[2].modulos.map((x: { clave: string }) => x.clave)).toEqual(['tesoreria.consulta', 'tesoreria.pagos']);
    expect(res.body[2].modulos[1]).toMatchObject({ admiteAprobar: false, admiteAnular: true });
  });

  it('sin módulos activos responde []', async () => {
    modulos = [m(1, 'dashboard', 'Navegación', 1, { activo: false })];
    await request(app.getHttpServer()).get('/administration/permisos/catalogo').expect(200, []);
  });
});
