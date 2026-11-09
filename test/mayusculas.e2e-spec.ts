import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Textos en mayúsculas (GRP S-11) con la aplicación completa: el cuerpo se convierte antes de validar, salvo las claves
 * excluidas, los campos de valores fijos, los marcados y las rutas con `@SinMayusculas()`.
 * Crea sus datos (`E2E-MAY-*`) y los elimina al final.
 */
describe('Textos en mayúsculas (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  const api = () => apiConSesion(app);
  let idCc = 0;
  let idRol = 0;

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
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-MAY-%'`);
      await db.query(`delete from rol where nombre like 'E2E-May %'`);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  it('el texto libre se guarda en mayúsculas', async () => {
    const res = await api()
      .post('/centros-costos')
      .send({ CentroCosto: 'e2e-may-obra norte', CodCliente: 'e2e-may', periodo: 2026, FechaIncio: '2026-05-01', Estado: 'ABIERTO' })
      .expect(201);
    idCc = res.body.id;
    expect(res.body.CentroCosto).toBe('E2E-MAY-OBRA NORTE');
    expect((await db.query('select centro_costo from "CentroCostos" where id = $1', [idCc])).rows[0].centro_costo).toBe('E2E-MAY-OBRA NORTE');
  });

  it('en la ficha de obra: la dirección va en mayúsculas; el comentario y los enlaces no se tocan', async () => {
    const { body } = await api()
      .patch(`/operaciones/obra/${idCc}/generales`)
      .send({ direccion: 'av. central 450', comentario: 'Nota en minúscula', expediente_codigo: 'exp-2026-01' })
      .expect(200);
    expect(body.direccion).toBe('AV. CENTRAL 450');
    expect(body.expediente_codigo).toBe('EXP-2026-01');
    expect(body.comentario).toBe('Nota en minúscula');
  });

  it('una ruta con @SinMayusculas() (roles) conserva el nombre tal cual', async () => {
    const res = await api().post('/administration/roles').send({ nombre: 'E2E-May Rol mixto', descripcion: 'Descripción en minúsculas' });
    expect(res.status).toBe(201);
    idRol = res.body.id;
    expect(res.body.nombre).toBe('E2E-May Rol mixto');
    expect(idRol).toBeGreaterThan(0);
  });

  it('un campo de valores fijos con minúsculas (estado de planta) llega intacto a la validación', async () => {
    // `estado_planta` se valida con @IsIn(['En Planta', …]); convertirlo lo rechazaría con 400.
    const res = await api()
      .post(`/operaciones/obra/${idCc}/residentes`)
      .send({ nombre_completo: 'ana torres', rol_obra: 'residente de obra', estado_planta: 'En Planta' })
      .expect(201);
    expect(res.body.nombre_completo).toBe('ANA TORRES');
    expect(res.body.rol_obra).toBe('RESIDENTE DE OBRA');
    expect(res.body.estado_planta).toBe('En Planta');
  });

  it('TipoPpto (campo marcado) conserva «Principal» y el estado se normaliza igual', async () => {
    const res = await api()
      .post('/presupuestos')
      .send({ IdPresupuesto: 'E2E-MAY-P1', id_centro_costo: idCc, TipoPpto: 'Principal', Proyecto: 'proyecto de prueba', Estado: 'En_Revision' })
      .expect(201);
    expect(res.body.TipoPpto).toBe('Principal');
    expect(res.body.Proyecto).toBe('PROYECTO DE PRUEBA');
    expect(res.body.estado_ppto).toBe('EN_REVISION');
    await db.query(`delete from "ppto_Principal" where "IdPresupuesto" = 'E2E-MAY-P1'`);
  });
});
