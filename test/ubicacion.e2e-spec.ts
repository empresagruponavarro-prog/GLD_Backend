import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/** Editar y borrar ubicaciones físicas. Crea su propio local, nivel y ambiente y los borra al terminar. */
describe('Ubicaciones físicas: editar y borrar (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let localId = 0;
  let nivelId = 0;
  let ambienteId = 0;
  let areaId = 0;

  const api = () => apiConSesion(app);

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    localId = (
      await db.query(
        `insert into local (codigo, nombre, id_empresa, estado) values ('E2E-LOC', 'LOCAL E2E', (select id_empresa from empresas limit 1), true) returning id`,
      )
    ).rows[0].id;
    nivelId = (await db.query(`insert into nivel (codigo, descripcion, estado) values ('E2E-NIV', 'NIVEL E2E', true) returning id`)).rows[0].id;
    ambienteId = (await db.query(`insert into ambiente (codigo, descripcion, estado) values ('E2E-AMB', 'AMBIENTE E2E', true) returning id`)).rows[0].id;
    areaId = (await db.query(`select id from area where estado limit 1`)).rows[0]?.id ?? 0;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await db.query(`delete from activo_fijo where serie = 'E2E-UBI'`);
    await db.query(`delete from ubicacion where id_local = $1`, [localId]);
    await db.query(`delete from local where id = $1`, [localId]);
    await db.query(`delete from nivel where id = $1`, [nivelId]);
    await db.query(`delete from ambiente where id = $1`, [ambienteId]);
    await borrarUsuarioE2E(db);
    await db.end();
    await app.close();
  });

  const crear = async () =>
    (await api().post('/maestros/ubicacion').send({ id_local: localId, id_nivel: nivelId, id_ambiente: ambienteId }).expect(201)).body;

  it('edita el área y las observaciones, y borra una ubicación sin equipos', async () => {
    const u = await crear();
    const { body: editada } = await api()
      .patch(`/maestros/ubicacion/${u.id}`)
      .send({ id_area: areaId || null, observaciones: 'Oficina de prueba' })
      .expect(200);
    expect(editada).toMatchObject({ id: u.id, observaciones: 'Oficina de prueba', id_area: areaId || null });

    await api().delete(`/maestros/ubicacion/${u.id}`).expect(204);
    await api().get(`/maestros/ubicacion/${u.id}`).expect(404);
    await api().delete(`/maestros/ubicacion/${u.id}`).expect(404);
  });

  it('no borra una ubicación que tiene equipos', async () => {
    const u = await crear();
    const producto = (await db.query(`select id from producto where clase_inventario = 'ACTIVO_FIJO' limit 1`)).rows[0]?.id;
    if (!producto) {
      await api().delete(`/maestros/ubicacion/${u.id}`).expect(204);
      return;
    }
    await db.query(
      `insert into activo_fijo (codigo, id_producto, serie, estado, id_ubicacion) values ('E2E-AF-UBI', $1, 'E2E-UBI', 'OPERATIVO', $2)`,
      [producto, u.id],
    );
    const { body } = await api().delete(`/maestros/ubicacion/${u.id}`).expect(409);
    expect(body.message).toContain('equipo');
    await db.query(`delete from activo_fijo where serie = 'E2E-UBI'`);
    await api().delete(`/maestros/ubicacion/${u.id}`).expect(204);
  });
});
