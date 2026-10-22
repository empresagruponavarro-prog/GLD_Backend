import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E, USUARIO_E2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Módulos por área y excepciones por usuario (plan 08) contra la BD de DATABASE_URL y con la API en
 * modo ESTRICTO. Crea su propia área (E2E-AREA), rol (E2E-ROL) y usuarios (E2E-USR, E2E-SIN) y los
 * elimina al final.
 */
describe('Área, módulos por área y excepciones de permisos (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let jwt: JwtService;
  const modoAnterior = process.env['PERMISOS_MODO'];
  let areaId = 0;
  let rolId = 0;

  const admin = () => apiConSesion(app);
  /** Cliente con la sesión de un usuario de prueba (el rol y el área los lee la API de la BD). */
  const como = (id: string, rol: string) => {
    const auth = `Bearer ${jwt.sign({ sub: id, usuario: id.toLowerCase(), rol })}`;
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set('Authorization', auth),
      post: (url: string) => request(server).post(url).set('Authorization', auth),
      put: (url: string) => request(server).put(url).set('Authorization', auth),
      delete: (url: string) => request(server).delete(url).set('Authorization', auth),
    };
  };
  const usuario = () => como('E2E-USR', 'E2E-ROL');
  const sinArea = () => como('E2E-SIN', 'E2E-ROL');
  const permisosDe = async (cliente: ReturnType<typeof como>) => (await cliente.get('/auth/mis-permisos').expect(200)).body.permisos;

  const entrada = (clave: string, acciones: Partial<Record<'ver' | 'crear' | 'editar' | 'eliminar' | 'aprobar' | 'anular', boolean>> = {}) => ({
    clave,
    ver: false,
    crear: false,
    editar: false,
    eliminar: false,
    aprobar: false,
    anular: false,
    ...acciones,
  });

  beforeAll(async () => {
    process.env['PERMISOS_MODO'] = 'estricto';
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    areaId = (await db.query(`insert into area (codigo, nombre, estado) values ('E2E-AREA', 'AREA E2E', true) returning id`)).rows[0].id;
    rolId = (await db.query(`insert into rol (nombre, descripcion, es_sistema) values ('E2E-ROL', 'rol de prueba e2e', false) returning id`)).rows[0].id;
    // El rol da ver/crear/editar en requerimientos y almacén › consulta, y ver/crear en tesorería › pagos.
    await db.query(
      `insert into rol_permiso (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular)
       select $1, m.id, true, true, m.clave <> 'tesoreria.pagos', false, false, false
       from modulo m where m.clave in ('requerimientos', 'almacen.consulta', 'tesoreria.pagos')`,
      [rolId],
    );
    await db.query(
      `insert into usuarios ("IdUsuario", "Nombres", "Usuario", "Clave", "Rol", activo, id_area) values
        ('E2E-USR', 'Usuario e2e con área', 'e2e-usr', null, 'E2E-ROL', true, $1),
        ('E2E-SIN', 'Usuario e2e sin área', 'e2e-sin', null, 'E2E-ROL', true, null)`,
      [areaId],
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    if (modoAnterior === undefined) delete process.env['PERMISOS_MODO'];
    else process.env['PERMISOS_MODO'] = modoAnterior;
    if (db) {
      await db.query(`delete from usuarios where "IdUsuario" in ('E2E-USR', 'E2E-SIN')`); // sus excepciones se borran en cascada
      await db.query('delete from area where id = $1', [areaId]); // sus módulos se borran en cascada
      await db.query('delete from rol where id = $1', [rolId]); // sus permisos se borran en cascada
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  it('sin módulos configurados el área no restringe: el usuario tiene lo que da su rol', async () => {
    const p = await permisosDe(usuario());
    expect(p['tesoreria.pagos']).toMatchObject({ ver: true, crear: true });
    expect(p['requerimientos']).toMatchObject({ ver: true, crear: true, editar: true });
  });

  it('el Administrador configura los módulos del área y la matriz lo refleja', async () => {
    const res = await admin()
      .put(`/administration/permisos/areas/${areaId}`)
      .send({
        modulos: [
          { clave: 'requerimientos', nivel: 'completo' },
          { clave: 'almacen.consulta', nivel: 'solo_ver' },
        ],
      })
      .expect(200);
    expect(res.body).toMatchObject({ id: areaId, configurada: true, usuarios: 1 });

    const matriz = (await admin().get('/administration/permisos/areas').expect(200)).body;
    const propia = matriz.areas.find((a: { id: number }) => a.id === areaId);
    expect(propia.modulos).toEqual(
      expect.arrayContaining([
        { clave: 'requerimientos', nivel: 'completo' },
        { clave: 'almacen.consulta', nivel: 'solo_ver' },
      ]),
    );
    // `sin_area` depende de lo que otras áreas tengan configurado en esta BD: solo se comprueba lo propio.
    expect(matriz.sin_area).not.toContain('requerimientos');
    expect(matriz.sin_area).not.toContain('almacen.consulta');
    expect(matriz.sin_area).not.toContain('admin.usuarios'); // Administración no depende del área
  });

  it('el usuario del área ve solo lo habilitado y lo que su rol permite: completo / solo ver / sin acceso', async () => {
    const p = await permisosDe(usuario());
    expect(p['requerimientos']).toMatchObject({ ver: true, crear: true, editar: true });
    expect(p['almacen.consulta']).toMatchObject({ ver: true, crear: false, editar: false });
    expect(p['tesoreria.pagos']).toMatchObject({ ver: false, crear: false });
  });

  it('la API aplica lo mismo que el menú (estricto): 403 en un módulo que el área no tiene, sin 403 en uno que sí', async () => {
    await usuario().post('/tesoreria/pagos').send({}).expect(403);
    // Permitido por permisos: llega a la validación del cuerpo (400), no al 403.
    await usuario().post('/requerimientos').send({}).expect(400);
  });

  it('un usuario sin área conserva lo de su rol aunque otras áreas estén configuradas', async () => {
    const p = await permisosDe(sinArea());
    expect(p['tesoreria.pagos']).toMatchObject({ ver: true, crear: true });
    await sinArea().post('/requerimientos').send({}).expect(400);
  });

  it('GET de la matriz de módulos por área exige poder ver Roles y permisos', async () => {
    await usuario().get('/administration/permisos/areas').expect(403);
    await usuario().put(`/administration/permisos/areas/${areaId}`).send({ modulos: [] }).expect(403);
  });

  it('rechaza módulos de Administración, desconocidos o repetidos al configurar un área', async () => {
    for (const modulos of [
      [{ clave: 'admin.usuarios', nivel: 'completo' }],
      [{ clave: 'no.existe', nivel: 'completo' }],
      [{ clave: 'requerimientos', nivel: 'completo' }, { clave: 'requerimientos', nivel: 'solo_ver' }],
    ]) {
      await admin().put(`/administration/permisos/areas/${areaId}`).send({ modulos }).expect(400);
    }
    await admin().put('/administration/permisos/areas/999999').send({ modulos: [] }).expect(404);
  });

  it('una excepción CONCEDE: el usuario accede a un módulo que su área no tiene (solo lo que se le dio)', async () => {
    const res = await admin()
      .put('/administration/usuarios/E2E-USR/permisos')
      .send({ excepciones: [entrada('tesoreria.pagos', { ver: true })] })
      .expect(200);
    expect(res.body).toMatchObject({ personalizado: true, area: { codigo: 'E2E-AREA' } });
    expect(res.body.modulos.find((m: { clave: string }) => m.clave === 'tesoreria.pagos')).toMatchObject({
      area: 'no',
      origen: 'excepcion',
      efectivo: { ver: true, crear: false },
    });

    const p = await permisosDe(usuario());
    expect(p['tesoreria.pagos']).toMatchObject({ ver: true, crear: false });
    // Solo se le dio Ver: anular un pago sigue prohibido (crear un pago exige solo Ver por decisión del plan 05).
    await usuario().post('/tesoreria/pagos/1/anular').send({}).expect(403);
    expect(p['requerimientos']).toMatchObject({ ver: true, crear: true }); // lo demás conserva rol + área
  });

  it('una excepción QUITA: reemplaza solo ese módulo', async () => {
    await admin()
      .put('/administration/usuarios/E2E-USR/permisos')
      .send({ excepciones: [entrada('requerimientos')] }) // todo en false
      .expect(200);
    const p = await permisosDe(usuario());
    expect(p['requerimientos']).toMatchObject({ ver: false, crear: false, editar: false });
    expect(p['almacen.consulta']).toMatchObject({ ver: true });
    await usuario().post('/requerimientos').send({}).expect(403);
  });

  it('el detalle del usuario explica el origen de cada permiso (rol → área → excepción)', async () => {
    const d = (await admin().get('/administration/usuarios/E2E-USR/permisos').expect(200)).body;
    const de = (clave: string) => d.modulos.find((m: { clave: string }) => m.clave === clave);
    expect(de('requerimientos')).toMatchObject({ origen: 'excepcion', excepcion: { ver: false } });
    expect(de('almacen.consulta')).toMatchObject({ origen: 'area', area: 'solo_ver' });
    expect(de('admin.usuarios')).toMatchObject({ area: 'sin_restriccion' });
  });

  it('seguridad: solo el Administrador, nunca sobre uno mismo ni sobre un Administrador, y nunca sobre Administración', async () => {
    // Un usuario con rol sin permisos de Administración no puede (403 del guard de Usuarios).
    await usuario().put('/administration/usuarios/E2E-SIN/permisos').send({ excepciones: [] }).expect(403);
    // El Administrador no se auto-modifica (409) ni modifica a otro Administrador.
    await admin().put(`/administration/usuarios/${USUARIO_E2E}/permisos`).send({ excepciones: [] }).expect(409);
    await admin().delete(`/administration/usuarios/${USUARIO_E2E}/permisos`).expect(409);
    // Administración solo se da por el rol.
    await admin()
      .put('/administration/usuarios/E2E-SIN/permisos')
      .send({ excepciones: [entrada('admin.usuarios', { ver: true, crear: true })] })
      .expect(400);
    // Acciones inválidas.
    await admin()
      .put('/administration/usuarios/E2E-SIN/permisos')
      .send({ excepciones: [entrada('requerimientos', { crear: true })] }) // sin Ver
      .expect(400);
    await admin()
      .put('/administration/usuarios/E2E-SIN/permisos')
      .send({ excepciones: [entrada('requerimientos', { ver: true, aprobar: true })] }) // el módulo no admite aprobar
      .expect(400);
    await admin().put('/administration/usuarios/NO-EXISTE/permisos').send({ excepciones: [] }).expect(404);
  });

  it('la lista de usuarios trae el área y marca a quien tiene excepciones', async () => {
    const lista: { IdUsuario: string; area: { codigo: string } | null; tiene_permisos_personalizados: boolean }[] = (
      await admin().get('/administration/usuarios').expect(200)
    ).body;
    expect(lista.find((u) => u.IdUsuario === 'E2E-USR')).toMatchObject({ area: { codigo: 'E2E-AREA' }, tiene_permisos_personalizados: true });
    expect(lista.find((u) => u.IdUsuario === 'E2E-SIN')).toMatchObject({ area: null, tiene_permisos_personalizados: false });
  });

  it('/auth/me devuelve el área del usuario (y null si no tiene)', async () => {
    expect((await usuario().get('/auth/me').expect(200)).body.area).toMatchObject({ id: areaId, codigo: 'E2E-AREA' });
    expect((await sinArea().get('/auth/me').expect(200)).body.area).toBeNull();
  });

  it('restablecer quita las excepciones y el usuario vuelve a rol + área', async () => {
    const res = await admin().delete('/administration/usuarios/E2E-USR/permisos').expect(200);
    expect(res.body.personalizado).toBe(false);
    const p = await permisosDe(usuario());
    expect(p['requerimientos']).toMatchObject({ ver: true, crear: true });
    expect(p['tesoreria.pagos']).toMatchObject({ ver: false });
  });

  it('dejar el área sin módulos vuelve a no restringirla', async () => {
    const res = await admin().put(`/administration/permisos/areas/${areaId}`).send({ modulos: [] }).expect(200);
    expect(res.body).toMatchObject({ configurada: false, modulos: [] });
    const p = await permisosDe(usuario());
    expect(p['tesoreria.pagos']).toMatchObject({ ver: true, crear: true });
  });
});
