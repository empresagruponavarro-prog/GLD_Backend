import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import {
  ARCHIVO_AUDITORIA_PERMISOS,
  AuditoriaPermisosService,
  type EntradaAuditoriaPermisos,
} from '../../../../platform/auth/permisos/auditoria-permisos.js';
import { MODULO_KEY } from '../../../../platform/auth/decorators/permisos.decorator.js';
import { AuditoriaPermisosController } from './auditoria.controller.js';
import { AuditoriaPermisosHandler } from './auditoria.handler.js';

const e = (over: Partial<EntradaAuditoriaPermisos>): EntradaAuditoriaPermisos => ({
  fecha: '2026-10-15T10:00:00.000Z',
  modo: 'auditoria',
  aplicado: false,
  usuario: 'USR-0042',
  rol: 'Jefe de Área',
  modulo: 'tesoreria.pagos',
  accion: 'ver',
  metodo: 'GET',
  ruta: '/tesoreria/pagos',
  controlador: 'PagosController',
  handler: 'list',
  ...over,
});

describe('GET /administration/permisos/auditoria', () => {
  let app: INestApplication;
  let dir: string;
  let archivo: string;
  const get = (query = '') => request(app.getHttpServer()).get(`/administration/permisos/auditoria${query}`);
  const escribir = (lineas: string[]) => writeFile(archivo, `${lineas.join('\n')}\n`, 'utf8');

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gld-auditoria-'));
    archivo = join(dir, 'permisos-auditoria.jsonl');
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditoriaPermisosController],
      providers: [
        AuditoriaPermisosHandler,
        AuditoriaPermisosService,
        { provide: ARCHIVO_AUDITORIA_PERMISOS, useValue: archivo },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(archivo, { force: true });
  });

  it('pertenece al módulo admin.roles (Administración: siempre estricto)', () => {
    expect(Reflect.getMetadata(MODULO_KEY, AuditoriaPermisosController)).toBe('admin.roles');
  });

  it('archivo inexistente → []', async () => {
    await get().expect(200, []);
  });

  it('agrega por módulo+acción+rol+método+ruta, cuenta, guarda la última y ordena por veces desc', async () => {
    await escribir([
      JSON.stringify(e({ fecha: '2026-10-15T10:00:00.000Z' })),
      JSON.stringify(e({ fecha: '2026-10-15T12:00:00.000Z', usuario: 'USR-0050' })),
      JSON.stringify(e({ fecha: '2026-10-15T11:00:00.000Z' })),
      JSON.stringify(e({ accion: 'crear', metodo: 'POST', fecha: '2026-10-15T09:00:00.000Z' })),
      JSON.stringify(e({ accion: 'crear', metodo: 'POST', fecha: '2026-10-15T09:30:00.000Z' })),
      JSON.stringify(e({ rol: 'Usuario', fecha: '2026-10-15T13:00:00.000Z' })),
      // Líneas ilegibles o incompletas se ignoran.
      'esto no es json',
      JSON.stringify({ modulo: 'x' }),
      '',
    ]);
    const res = await get().expect(200);
    expect(res.body).toEqual([
      { modulo: 'tesoreria.pagos', accion: 'ver', rol: 'Jefe de Área', metodo: 'GET', ruta: '/tesoreria/pagos', veces: 3, ultima: '2026-10-15T12:00:00.000Z' },
      { modulo: 'tesoreria.pagos', accion: 'crear', rol: 'Jefe de Área', metodo: 'POST', ruta: '/tesoreria/pagos', veces: 2, ultima: '2026-10-15T09:30:00.000Z' },
      { modulo: 'tesoreria.pagos', accion: 'ver', rol: 'Usuario', metodo: 'GET', ruta: '/tesoreria/pagos', veces: 1, ultima: '2026-10-15T13:00:00.000Z' },
    ]);
  });

  it('?desde filtra por fecha (inclusive)', async () => {
    await escribir([
      JSON.stringify(e({ fecha: '2026-10-14T23:59:59.000Z' })),
      JSON.stringify(e({ fecha: '2026-10-15T08:00:00.000Z' })),
      JSON.stringify(e({ fecha: '2026-10-16T08:00:00.000Z', accion: 'editar', metodo: 'PATCH' })),
    ]);
    const res = await get('?desde=2026-10-15T08:00:00.000Z').expect(200);
    // A igualdad de veces, la más reciente primero.
    expect(res.body.map((r: { accion: string; veces: number }) => [r.accion, r.veces])).toEqual([
      ['editar', 1],
      ['ver', 1],
    ]);
    const soloDia = await get('?desde=2026-10-16').expect(200);
    expect(soloDia.body).toHaveLength(1);
  });

  it('?desde inválido → 400', async () => {
    await get('?desde=ayer').expect(400);
  });
});
