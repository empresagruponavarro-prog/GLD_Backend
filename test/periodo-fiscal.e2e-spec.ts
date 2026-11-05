import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Periodo de un centro de costo y de un presupuesto (GRP S-11, SP-18): año activo de `periodo_fiscal` y año de la fecha de
 * inicio. Crea sus centros de costo (`E2E-PER-*`) y presupuestos, y los elimina al final.
 */
describe('Periodo fiscal en centros de costo y presupuestos (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  const api = () => apiConSesion(app);
  let idCc = 0;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      const ids = `(select id from "CentroCostos" where centro_costo like 'E2E-PER-%')`;
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ids} or "IdPresupuesto" like 'E2E-PER-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-PER-%'`);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  const nuevoCc = (extra: Record<string, unknown>) => api().post('/centros-costos').send({ CentroCosto: 'E2E-PER-A', CodCliente: 'E2E-PER', Estado: 'ABIERTO', periodo: 2026, FechaIncio: '2026-05-01', ...extra });

  it('rechaza un periodo que no está activo', async () => {
    const res = await nuevoCc({ periodo: 2019, FechaIncio: '2019-03-01' }).expect(400);
    expect(res.body.message).toMatch(/no está activo/);
  });

  it('rechaza un periodo distinto del año de la fecha de inicio', async () => {
    const res = await nuevoCc({ periodo: 2026, FechaIncio: '2027-02-01' }).expect(400);
    expect(res.body.message).toMatch(/año de la fecha de inicio \(2027\)/);
  });

  it('acepta 2027 (activo) con inicio en 2027', async () => {
    const res = await nuevoCc({ periodo: 2027, FechaIncio: '2027-02-01' }).expect(201);
    idCc = res.body.id;
    expect(res.body.periodo).toBe(2027);
  });

  it('al editar, cambiar el periodo o el inicio se valida; lo que no cambia no', async () => {
    await api().patch(`/centros-costos/${idCc}`).send({ CentroCosto: 'E2E-PER-A2', periodo: 2027, FechaIncio: '2027-02-01' }).expect(200);
    await api().patch(`/centros-costos/${idCc}`).send({ periodo: 2026 }).expect(400); // el inicio sigue en 2027
    await api().patch(`/centros-costos/${idCc}`).send({ FechaIncio: '2026-05-01' }).expect(400); // el periodo sigue en 2027
    await api().patch(`/centros-costos/${idCc}`).send({ periodo: 2026, FechaIncio: '2026-05-01' }).expect(200);
  });

  it('un centro de costo antiguo con periodo inactivo se puede seguir editando mientras no se toque el periodo', async () => {
    const antiguo = (await db.query(`insert into "CentroCostos" (centro_costo, estado, periodo) values ('E2E-PER-OLD', 'ABIERTO', 2019) returning id`)).rows[0].id;
    await api().patch(`/centros-costos/${antiguo}`).send({ CentroCosto: 'E2E-PER-OLD2', periodo: 2019 }).expect(200);
    await api().patch(`/centros-costos/${antiguo}`).send({ periodo: 2018 }).expect(400);
  });

  it('el presupuesto valida su periodo contra los años activos y el inicio de su obra', async () => {
    await api().post('/presupuestos').send({ IdPresupuesto: 'E2E-PER-P1', id_centro_costo: idCc, TipoPpto: 'Principal', periodo: 2019 }).expect(400);
    await api().post('/presupuestos').send({ IdPresupuesto: 'E2E-PER-P1', id_centro_costo: idCc, TipoPpto: 'Principal', periodo: 2027 }).expect(400); // la obra inicia en 2026
    const ok = await api().post('/presupuestos').send({ IdPresupuesto: 'E2E-PER-P1', id_centro_costo: idCc, TipoPpto: 'Principal', periodo: 2026 }).expect(201);
    expect(ok.body.periodo).toBe(2026);

    await api().patch('/presupuestos/E2E-PER-P1').send({ periodo: 2019 }).expect(400);
    await api().patch('/presupuestos/E2E-PER-P1').send({ periodo: 2026, Proyecto: 'Sin cambio de periodo' }).expect(200);
  });
});
