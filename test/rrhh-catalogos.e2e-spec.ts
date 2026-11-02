import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * RR.HH. › Catálogos de RR.HH. contra la BD de DATABASE_URL y con la API en modo ESTRICTO. Crea sus propias
 * opciones (prefijo E2E), un trabajador que usa una de ellas y un rol que solo tiene Trabajadores; borra todo
 * al terminar.
 */
describe('RR.HH. › Catálogos de RR.HH. (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let jwt: JwtService;
  const modoAnterior = process.env['PERMISOS_MODO'];
  const marca = String(Date.now()).slice(-6);
  let rolId = 0;
  let trabajadorId = 0;

  const admin = () => apiConSesion(app);
  /** Usuario de RR.HH. que edita trabajadores pero no tiene el permiso de catálogos. */
  const soloTrabajadores = () => {
    const auth = `Bearer ${jwt.sign({ sub: 'E2E-RRHH-CAT', usuario: 'e2e-rrhh-cat', rol: 'E2E-RRHH-CAT-ROL' })}`;
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set('Authorization', auth),
      post: (url: string) => request(server).post(url).set('Authorization', auth),
    };
  };

  beforeAll(async () => {
    process.env['PERMISOS_MODO'] = 'estricto';
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    rolId = (await db.query(`insert into rol (nombre, descripcion, es_sistema) values ('E2E-RRHH-CAT-ROL', 'rol de prueba e2e', false) returning id`)).rows[0].id;
    await db.query(
      `insert into rol_permiso (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular)
       select $1, m.id, true, true, true, true, false, false from modulo m where m.clave = 'rrhh.trabajadores'`,
      [rolId],
    );
    await db.query(
      `insert into usuarios ("IdUsuario", "Nombres", "Usuario", "Clave", "Rol", activo, id_area) values ('E2E-RRHH-CAT', 'Usuario e2e', 'e2e-rrhh-cat', null, 'E2E-RRHH-CAT-ROL', true, null)`,
    );
    trabajadorId = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Trabajador', 'E2E CATALOGOS TRABAJADOR', true) returning id`)).rows[0].id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    process.env['PERMISOS_MODO'] = modoAnterior;
    await db.query('DELETE FROM anexos WHERE id = $1', [trabajadorId]);
    await db.query(`DELETE FROM rrhh_modalidad_contrato WHERE nombre LIKE 'E2E %${marca}%'`);
    await db.query(`DELETE FROM rrhh_tipo_trabajador WHERE nombre LIKE 'E2E %${marca}%'`);
    await db.query(`DELETE FROM usuarios WHERE "IdUsuario" = 'E2E-RRHH-CAT'`);
    await db.query('DELETE FROM rol WHERE id = $1', [rolId]);
    await borrarUsuarioE2E(db);
    await db.end();
    await app.close();
  });

  it('lista cada catálogo en orden y con sus usos; rechaza un catálogo que no existe', async () => {
    const { body } = await admin().get('/rrhh/catalogos/tipos-trabajador').expect(200);
    expect(body.map((o: { nombre: string }) => o.nombre)).toEqual(expect.arrayContaining(['EMPLEADO', 'OBRERO']));
    expect(body[0]).toEqual(expect.objectContaining({ activo: true, usos: expect.any(Number) }));
    await admin().get('/rrhh/catalogos/cualquiera').expect(400);
  });

  it('agrega al final en mayúsculas, sin repetir; renombra y desactiva', async () => {
    const url = '/rrhh/catalogos/modalidades-contrato';
    const { body: nueva } = await admin().post(url).send({ nombre: `  e2e   modalidad ${marca} ` }).expect(201);
    expect(nueva).toMatchObject({ nombre: `E2E MODALIDAD ${marca}`, activo: true, usos: 0 });
    const { body: lista } = await admin().get(url).expect(200);
    expect(lista[lista.length - 1].id).toBe(nueva.id);
    await admin().post(url).send({ nombre: `E2E Modalidad ${marca}` }).expect(409);
    await admin().post(url).send({ nombre: '   ' }).expect(400);

    const { body: renombrada } = await admin().patch(`${url}/${nueva.id}`).send({ nombre: `e2e modalidad ${marca} b` }).expect(200);
    expect(renombrada.nombre).toBe(`E2E MODALIDAD ${marca} B`);
    await admin().patch(`${url}/${nueva.id}`).send({ nombre: 'PLAZO INDETERMINADO' }).expect(409);

    const { body: desactivada } = await admin().patch(`${url}/${nueva.id}`).send({ activo: false }).expect(200);
    expect(desactivada.activo).toBe(false);
    // El formulario de Trabajadores la recibe marcada como inactiva.
    const { body: opciones } = await admin().get('/rrhh/trabajadores/opciones').expect(200);
    expect(opciones.modalidadesContrato).toEqual(expect.arrayContaining([{ id: nueva.id, nombre: `E2E MODALIDAD ${marca} B`, activo: false }]));
    await admin().patch(`${url}/999999999`).send({ activo: false }).expect(404);
  });

  it('sube y baja una opción en la lista', async () => {
    const url = '/rrhh/catalogos/tipos-trabajador';
    const { body: a } = await admin().post(url).send({ nombre: `E2E TIPO A ${marca}` }).expect(201);
    const { body: b } = await admin().post(url).send({ nombre: `E2E TIPO B ${marca}` }).expect(201);
    const posicion = (lista: { id: number }[], id: number) => lista.findIndex((o) => o.id === id);
    const { body: subida } = await admin().post(`${url}/${b.id}/mover`).send({ direccion: 'arriba' }).expect(200);
    expect(posicion(subida, b.id)).toBe(posicion(subida, a.id) - 1);
    const { body: bajada } = await admin().post(`${url}/${b.id}/mover`).send({ direccion: 'abajo' }).expect(200);
    expect(posicion(bajada, b.id)).toBe(posicion(bajada, a.id) + 1);
    await admin().post(`${url}/${b.id}/mover`).send({ direccion: 'izquierda' }).expect(400);
  });

  it('elimina una opción sin uso; una en uso no (se desactiva)', async () => {
    const url = '/rrhh/catalogos/tipos-trabajador';
    const { body: libre } = await admin().post(url).send({ nombre: `E2E LIBRE ${marca}` }).expect(201);
    await admin().delete(`${url}/${libre.id}`).expect(204);
    const { body: usada } = await admin().post(url).send({ nombre: `E2E USADA ${marca}` }).expect(201);
    await db.query('insert into trabajador (id_anexo, id_tipo_trabajador) values ($1, $2)', [trabajadorId, usada.id]);
    const { body: lista } = await admin().get(url).expect(200);
    expect(lista.find((o: { id: number }) => o.id === usada.id).usos).toBe(1);
    const r = await admin().delete(`${url}/${usada.id}`).expect(409);
    expect(String(r.body.message)).toContain('Desactívala');
  });

  it('editar trabajadores no da permiso para cambiar las listas', async () => {
    await soloTrabajadores().get('/rrhh/catalogos/tipos-trabajador').expect(403);
    await soloTrabajadores().post('/rrhh/catalogos/tipos-trabajador').send({ nombre: `E2E NO ${marca}` }).expect(403);
    // Pero sí recibe las opciones para el formulario de Trabajadores.
    await soloTrabajadores().get('/rrhh/trabajadores/opciones').expect(200);
  });
});
