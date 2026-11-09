import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Catálogo ubigeo INEI y ubicación de la ficha de obra por código de distrito, contra la BD de DATABASE_URL.
 * El catálogo lo carga la migración `20261109T2104_ubigeo`; la prueba crea y borra su propio centro de costo.
 */
describe('Ubigeo y ubicación de la obra (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let cc = 0;
  const api = () => apiConSesion(app);

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    cc = (await db.query(`insert into "CentroCostos" (centro_costo, estado) values ('E2E-UBIGEO', 'ABIERTO') returning id`)).rows[0].id;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      await db.query(`delete from "CentroCostos" where id = $1`, [cc]);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  it('las listas se encadenan por código: departamento › provincia › distrito', async () => {
    const deps = (await api().get('/maestros/ubigeo/departamentos').expect(200)).body as { id: string; nombre: string }[];
    expect(deps).toHaveLength(25);
    expect(deps).toContainEqual({ id: '15', nombre: 'LIMA' });
    const provs = (await api().get('/maestros/ubigeo/provincias?departamento=15').expect(200)).body as { id: string }[];
    expect(provs.every((p) => p.id.startsWith('15'))).toBe(true);
    const dists = (await api().get('/maestros/ubigeo/distritos?provincia=1501').expect(200)).body as { id: string; nombre: string }[];
    expect(dists).toContainEqual({ id: '150142', nombre: 'VILLA EL SALVADOR' });
  });

  it('desde el código se obtiene la ubicación completa; un código mal formado o inexistente se rechaza', async () => {
    const u = (await api().get('/maestros/ubigeo/distritos/150142').expect(200)).body;
    expect(u).toEqual({ id_distrito: '150142', id_provincia: '1501', id_departamento: '15', departamento: 'LIMA', provincia: 'LIMA', distrito: 'VILLA EL SALVADOR' });
    await api().get('/maestros/ubigeo/distritos/999999').expect(404);
    await api().get('/maestros/ubigeo/distritos/15014').expect(400);
    await api().get('/maestros/ubigeo/provincias?departamento=1').expect(400);
  });

  it('la ficha guarda solo el distrito y devuelve los nombres de los tres niveles', async () => {
    const r = (await api().patch(`/operaciones/obra/${cc}/generales`).send({ id_distrito: '150142' }).expect(200)).body;
    expect(r).toMatchObject({ id_distrito: '150142', ubigeo_cod: '150142', departamento: 'LIMA', provincia: 'LIMA', distrito: 'VILLA EL SALVADOR' });
    expect((await db.query(`select id_distrito from obra_datos_generales where id_centro_costo = $1`, [cc])).rows[0].id_distrito).toBe('150142');
  });

  it('un distrito que no existe no se guarda; null quita la ubicación', async () => {
    await api().patch(`/operaciones/obra/${cc}/generales`).send({ id_distrito: '999999' }).expect(400);
    await api().patch(`/operaciones/obra/${cc}/generales`).send({ id_distrito: 'LIMA' }).expect(400);
    const r = (await api().patch(`/operaciones/obra/${cc}/generales`).send({ id_distrito: null }).expect(200)).body;
    expect(r.id_distrito).toBeUndefined();
    expect(r.departamento).toBeUndefined();
  });
});
