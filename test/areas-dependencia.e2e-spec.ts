import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Área de la que depende cada área (organigrama) contra la BD de DATABASE_URL. Crea sus propias áreas
 * y el trabajador jefe, y los elimina al terminar.
 */
describe('Dependencia entre áreas (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let jefeId = 0;
  const creadas: number[] = [];

  const api = () => apiConSesion(app);
  const crear = async (nombre: string, extra: Record<string, unknown> = {}) => {
    const { body } = await api()
      .post('/maestros/area')
      .send({ nombre, ...extra })
      .expect(201);
    creadas.push(body.id);
    return body as { id: number; idAreaPadre: number | null; areaPadre: string | null; jefeSuperior: string | null };
  };

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    jefeId = (
      await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Trabajador', 'E2E JEFE DE AREA', true) returning id`)
    ).rows[0].id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    // Primero las hijas (la FK de dependencia es RESTRICT): de la última creada a la primera.
    for (const id of [...creadas].reverse()) await db.query('DELETE FROM area WHERE id = $1', [id]);
    await db.query('DELETE FROM anexos WHERE id = $1', [jefeId]);
    await borrarUsuarioE2E(db);
    await db.end();
    await app.close();
  });

  it('una área nueva sin dependencia es un área superior', async () => {
    const raiz = await crear('E2E GERENCIA');
    expect(raiz).toMatchObject({ idAreaPadre: null, areaPadre: null, jefeSuperior: null });
  });

  it('crea un área activa por defecto o inactiva si se indica', async () => {
    const activa = await crear('E2E ACTIVA');
    const inactiva = await crear('E2E INACTIVA', { estado: false });
    const { body: lista } = await api().get('/maestros/area').expect(200);
    expect(lista.find((a: { id: number }) => a.id === activa.id)).toMatchObject({ estado: true });
    expect(lista.find((a: { id: number }) => a.id === inactiva.id)).toMatchObject({ estado: false });
  });

  it('muestra el área de la que depende y el jefe de esa área como jefe superior', async () => {
    const gerencia = await crear('E2E GERENCIA 2', { idJefe: jefeId });
    const jefatura = await crear('E2E JEFATURA', { idAreaPadre: gerencia.id });
    expect(jefatura).toMatchObject({ idAreaPadre: gerencia.id, areaPadre: 'E2E GERENCIA 2', jefeSuperior: 'E2E JEFE DE AREA' });
    const { body: lista } = await api().get('/maestros/area').expect(200);
    expect(lista.find((a: { id: number }) => a.id === jefatura.id)).toMatchObject({ jefeSuperior: 'E2E JEFE DE AREA' });
  });

  it('cambia y quita la dependencia con PATCH (0 la deja como área superior)', async () => {
    const a = await crear('E2E AREA A');
    const b = await crear('E2E AREA B');
    const { body: movida } = await api().patch(`/maestros/area/${b.id}`).send({ idAreaPadre: a.id }).expect(200);
    expect(movida).toMatchObject({ idAreaPadre: a.id, areaPadre: 'E2E AREA A' });
    // Editar otro dato no toca la dependencia.
    const { body: renombrada } = await api().patch(`/maestros/area/${b.id}`).send({ descripcion: 'sin tocar el padre' }).expect(200);
    expect(renombrada.idAreaPadre).toBe(a.id);
    const { body: suelta } = await api().patch(`/maestros/area/${b.id}`).send({ idAreaPadre: 0 }).expect(200);
    expect(suelta).toMatchObject({ idAreaPadre: null, areaPadre: null });
  });

  it('rechaza un área superior que no existe, la misma área y los ciclos', async () => {
    const a = await crear('E2E CICLO A');
    const b = await crear('E2E CICLO B', { idAreaPadre: a.id });
    const c = await crear('E2E CICLO C', { idAreaPadre: b.id });
    await api().post('/maestros/area').send({ nombre: 'E2E HUERFANA', idAreaPadre: 999999999 }).expect(400);
    await api().patch(`/maestros/area/${a.id}`).send({ idAreaPadre: a.id }).expect(400);
    // A -> B -> C: A no puede depender de B ni de C.
    await api().patch(`/maestros/area/${a.id}`).send({ idAreaPadre: b.id }).expect(400);
    await api().patch(`/maestros/area/${a.id}`).send({ idAreaPadre: c.id }).expect(400);
    // C sí puede pasar a depender directamente de A (se salta el nivel intermedio).
    await api().patch(`/maestros/area/${c.id}`).send({ idAreaPadre: a.id }).expect(200);
  });

  it('no deja eliminar un área de la que dependen otras', async () => {
    const padre = await crear('E2E PADRE');
    const hija = await crear('E2E HIJA', { idAreaPadre: padre.id });
    const { body } = await api().delete(`/maestros/area/${padre.id}`).expect(409);
    expect(String(body.message)).toContain('que dependen de ella');
    await api().delete(`/maestros/area/${hija.id}`).expect(204);
    await api().delete(`/maestros/area/${padre.id}`).expect(204);
  });
});
