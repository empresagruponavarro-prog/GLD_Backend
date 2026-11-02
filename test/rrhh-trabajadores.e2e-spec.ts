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
 * RR.HH. › Trabajadores (ficha incluida) contra la BD de DATABASE_URL y con la API en modo ESTRICTO. Crea su
 * propio rol (E2E-RRHH-ROL), usuario (E2E-RRHH), área, modalidad de prueba, proveedor y trabajadores, y los
 * elimina al final.
 */
describe('RR.HH. › Trabajadores (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let jwt: JwtService;
  const modoAnterior = process.env['PERMISOS_MODO'];
  let rolId = 0;
  let proveedorId = 0;
  let areaId = 0;
  let dni = 0;
  let pasaporte = 0;
  let docProveedor = 0;
  let tipoId = 0;
  let modalidadId = 0;
  let modalidadPruebaId = 0;
  const creados: number[] = [];
  /** Documentos únicos por corrida (no chocan con datos reales ni con corridas anteriores). */
  const base = String(Date.now()).slice(-6);
  const dniNuevo = (n: number) => `9${base}${n}`.slice(0, 8);

  const admin = () => apiConSesion(app);
  /** Usuario con permisos solo en rrhh.trabajadores (ver, crear, editar): el rol de RR.HH. */
  const rrhh = () => {
    const auth = `Bearer ${jwt.sign({ sub: 'E2E-RRHH', usuario: 'e2e-rrhh', rol: 'E2E-RRHH-ROL' })}`;
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set('Authorization', auth),
      post: (url: string) => request(server).post(url).set('Authorization', auth),
      patch: (url: string) => request(server).patch(url).set('Authorization', auth),
    };
  };
  const cuerpo = (n: number, extra: Record<string, unknown> = {}) => ({
    Anexo: `E2E RRHH TRABAJADOR ${n}`,
    AnexoTipoDocIdeId: dni,
    NumeroDocIde: dniNuevo(n),
    idTipoTrabajador: tipoId,
    idModalidadContrato: modalidadId,
    ...extra,
  });
  const crear = async (n: number, extra: Record<string, unknown> = {}) => {
    const { body } = await rrhh().post('/rrhh/trabajadores').send(cuerpo(n, extra)).expect(201);
    creados.push(body.id);
    return body;
  };

  beforeAll(async () => {
    process.env['PERMISOS_MODO'] = 'estricto';
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    rolId = (await db.query(`insert into rol (nombre, descripcion, es_sistema) values ('E2E-RRHH-ROL', 'rol de prueba e2e', false) returning id`)).rows[0].id;
    await db.query(
      `insert into rol_permiso (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular)
       select $1, m.id, true, true, true, false, false, false from modulo m where m.clave = 'rrhh.trabajadores'`,
      [rolId],
    );
    await db.query(
      `insert into usuarios ("IdUsuario", "Nombres", "Usuario", "Clave", "Rol", activo, id_area) values ('E2E-RRHH', 'Usuario e2e de RR.HH.', 'e2e-rrhh', null, 'E2E-RRHH-ROL', true, null)`,
    );
    proveedorId = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Proveedor', 'E2E RRHH PROVEEDOR', true) returning id`)).rows[0].id;
    areaId = (await db.query(`insert into area (codigo, nombre, estado) values ('E2E-RRHH', 'E2E AREA RRHH', true) returning id`)).rows[0].id;
    const doc = async (tipo: string, nombre: string) =>
      (await db.query(`select id from "anexo_TipoDocIDE" where "TipoAnexo" = $1 and "Anexo_Documento_IDE" = $2`, [tipo, nombre])).rows[0].id as number;
    dni = await doc('Trabajador', 'DNI');
    pasaporte = await doc('Trabajador', 'PASAPORTE');
    docProveedor = await doc('Proveedor', 'DNI');
    tipoId = (await db.query(`select id from rrhh_tipo_trabajador where nombre = 'EMPLEADO'`)).rows[0].id;
    modalidadId = (await db.query(`select id from rrhh_modalidad_contrato where nombre = 'PLAZO INDETERMINADO'`)).rows[0].id;
    modalidadPruebaId = (await db.query(`insert into rrhh_modalidad_contrato (nombre, orden) values ('E2E MODALIDAD ${base}', 99) returning id`)).rows[0].id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    process.env['PERMISOS_MODO'] = modoAnterior;
    // La ficha se borra con el anexo (ON DELETE CASCADE).
    for (const id of creados) await db.query('DELETE FROM anexos WHERE id = $1', [id]);
    await db.query('DELETE FROM anexos WHERE id = $1', [proveedorId]);
    await db.query('DELETE FROM rrhh_modalidad_contrato WHERE id = $1', [modalidadPruebaId]);
    await db.query('DELETE FROM area WHERE id = $1', [areaId]);
    await db.query(`DELETE FROM usuarios WHERE "IdUsuario" = 'E2E-RRHH'`);
    await db.query('DELETE FROM rol WHERE id = $1', [rolId]);
    await borrarUsuarioE2E(db);
    await db.end();
    await app.close();
  });

  it('las opciones traen los documentos de trabajador y los catálogos con su estado', async () => {
    const { body } = await rrhh().get('/rrhh/trabajadores/opciones').expect(200);
    expect(body.tiposDocumento.map((d: { id: number }) => d.id)).toEqual(expect.arrayContaining([dni, pasaporte]));
    expect(body.tiposDocumento.map((d: { id: number }) => d.id)).not.toContain(docProveedor);
    expect(body.tiposTrabajador.map((t: { nombre: string }) => t.nombre)).toEqual(expect.arrayContaining(['EMPLEADO', 'OBRERO']));
    expect(body.modalidadesContrato).toEqual(expect.arrayContaining([{ id: modalidadId, nombre: 'PLAZO INDETERMINADO', activo: true }]));
  });

  it('RR.HH. registra un trabajador con su ficha, lo busca, lo edita y lo da de baja', async () => {
    const nuevo = await crear(1, {
      Anexo: '  E2E RRHH TRABAJADOR 1  ',
      Telefono: '999888777',
      idArea: areaId,
      correoInstitucional: 'uno@empresa.pe',
      telefonoInstitucional: ' Anexo 214 ',
    });
    expect(nuevo).toMatchObject({
      Anexo: 'E2E RRHH TRABAJADOR 1',
      NumeroDocIde: dniNuevo(1),
      estado: true,
      conFicha: true,
      tipoTrabajador: 'EMPLEADO',
      modalidadContrato: 'PLAZO INDETERMINADO',
      idArea: areaId,
      area: 'E2E AREA RRHH',
      correoInstitucional: 'uno@empresa.pe',
      telefonoInstitucional: 'Anexo 214',
      direccionInstitucional: null,
    });
    const fila = (await db.query('select "tipoAnexo" from anexos where id = $1', [nuevo.id])).rows[0];
    expect(fila.tipoAnexo).toBe('Trabajador');

    const { body: porDocumento } = await rrhh().get(`/rrhh/trabajadores?busqueda=${dniNuevo(1)}`).expect(200);
    expect(porDocumento.data).toEqual([expect.objectContaining({ id: nuevo.id, modalidadContrato: 'PLAZO INDETERMINADO', area: 'E2E AREA RRHH' })]);

    const { body: editado } = await rrhh().patch(`/rrhh/trabajadores/${nuevo.id}`).send({ Correo: 'uno@gmail.com', idArea: null }).expect(200);
    expect(editado).toMatchObject({ Correo: 'uno@gmail.com', Telefono: '999888777', idArea: null, area: null, tipoTrabajador: 'EMPLEADO' });

    const { body: baja } = await rrhh().patch(`/rrhh/trabajadores/${nuevo.id}`).send({ estado: false }).expect(200);
    expect(baja.estado).toBe(false);
    const { body: inactivos } = await rrhh().get(`/rrhh/trabajadores?estado=false&busqueda=${dniNuevo(1)}`).expect(200);
    expect(inactivos.data.map((t: { id: number }) => t.id)).toEqual([nuevo.id]);
  });

  it('valida documento, catálogos, área y correos', async () => {
    const r = rrhh();
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), idTipoTrabajador: undefined }).expect(400);
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), idModalidadContrato: undefined }).expect(400);
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), Anexo: '   ' }).expect(400);
    const dniCorto = await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), NumeroDocIde: '1234567' }).expect(400);
    expect(String(dniCorto.body.message)).toContain('8 dígitos');
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), NumeroDocIde: '-' }).expect(400);
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), AnexoTipoDocIdeId: docProveedor }).expect(400);
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), AnexoTipoDocIdeId: pasaporte, NumeroDocIde: 'AB1' }).expect(400);
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), correoInstitucional: 'no-es-correo' }).expect(400);
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), idArea: 999999999 }).expect(400);
    await db.query('update rrhh_modalidad_contrato set activo = false where id = $1', [modalidadPruebaId]);
    await r.post('/rrhh/trabajadores').send({ ...cuerpo(2), idModalidadContrato: modalidadPruebaId }).expect(400);

    const primero = await crear(3);
    const repetido = await r.post('/rrhh/trabajadores').send({ ...cuerpo(4), NumeroDocIde: dniNuevo(3) }).expect(409);
    expect(String(repetido.body.message)).toContain('E2E RRHH TRABAJADOR 3');
    // Volver a guardar su propio documento no es repetirlo.
    await r.patch(`/rrhh/trabajadores/${primero.id}`).send({ NumeroDocIde: dniNuevo(3) }).expect(200);
    // Los obligatorios no se pueden vaciar al editar.
    await r.patch(`/rrhh/trabajadores/${primero.id}`).send({ idModalidadContrato: null }).expect(400);
    await r.patch(`/rrhh/trabajadores/${primero.id}`).send({ NumeroDocIde: null }).expect(400);
  });

  it('una opción desactivada se queda en quien ya la tenía, pero no se puede elegir de nuevo', async () => {
    await db.query('update rrhh_modalidad_contrato set activo = true where id = $1', [modalidadPruebaId]);
    const t = await crear(5, { idModalidadContrato: modalidadPruebaId });
    await db.query('update rrhh_modalidad_contrato set activo = false where id = $1', [modalidadPruebaId]);
    const { body } = await rrhh().patch(`/rrhh/trabajadores/${t.id}`).send({ ...cuerpo(5, { idModalidadContrato: modalidadPruebaId }), Telefono: '911' }).expect(200);
    expect(body).toMatchObject({ idModalidadContrato: modalidadPruebaId, Telefono: '911' });
    const otro = await crear(6);
    await rrhh().patch(`/rrhh/trabajadores/${otro.id}`).send({ idModalidadContrato: modalidadPruebaId }).expect(400);
  });

  it('un trabajador antiguo (sin ficha) se completa al editarlo; su documento «-» se corrige ahí', async () => {
    const antiguo = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", "NumeroDocIde", estado) values ('Trabajador', 'E2E RRHH ANTIGUO', '-', true) returning id`)).rows[0].id as number;
    creados.push(antiguo);
    const { body: sinFicha } = await rrhh().get(`/rrhh/trabajadores/${antiguo}`).expect(200);
    expect(sinFicha).toMatchObject({ conFicha: false, tipoTrabajador: null, modalidadContrato: null });
    // Darlo de baja no exige completar nada.
    await rrhh().patch(`/rrhh/trabajadores/${antiguo}`).send({ estado: false }).expect(200);
    // Completar la ficha sin tipo ni modalidad no se acepta.
    await rrhh().patch(`/rrhh/trabajadores/${antiguo}`).send({ idArea: areaId }).expect(400);
    // El documento «-» no pasa si se envía.
    await rrhh().patch(`/rrhh/trabajadores/${antiguo}`).send({ AnexoTipoDocIdeId: dni, NumeroDocIde: '-' }).expect(400);
    const { body: completo } = await rrhh()
      .patch(`/rrhh/trabajadores/${antiguo}`)
      .send({ AnexoTipoDocIdeId: dni, NumeroDocIde: dniNuevo(7), idTipoTrabajador: tipoId, idModalidadContrato: modalidadId, idArea: areaId })
      .expect(200);
    expect(completo).toMatchObject({ conFicha: true, NumeroDocIde: dniNuevo(7), tipoTrabajador: 'EMPLEADO', area: 'E2E AREA RRHH' });
  });

  it('filtra por situación (ficha o documento pendiente), tipo, modalidad y área; el resumen los cuenta', async () => {
    const nombre = `E2E RRHH FILTRO ${base}`;
    const pendiente = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", "NumeroDocIde", estado) values ('Trabajador', $1, '-', true) returning id`, [nombre])).rows[0].id as number;
    creados.push(pendiente);
    const completo = await crear(9, { Anexo: `${nombre} COMPLETO`, idArea: areaId });
    const ids = (body: { data: { id: number }[] }) => body.data.map((t) => t.id);
    const listar = async (filtros: string) => (await rrhh().get(`/rrhh/trabajadores?busqueda=${encodeURIComponent(nombre)}&${filtros}`).expect(200)).body;

    expect(ids(await listar('situacion=ficha-pendiente'))).toEqual([pendiente]);
    expect(ids(await listar('situacion=documento-pendiente'))).toEqual([pendiente]);
    expect(ids(await listar(`idArea=${areaId}`))).toEqual([completo.id]);
    expect(ids(await listar(`idTipoTrabajador=${tipoId}&idModalidadContrato=${modalidadId}`))).toEqual([completo.id]);
    expect(ids(await listar(`situacion=ficha-pendiente&idArea=${areaId}`))).toEqual([]);
    await rrhh().get('/rrhh/trabajadores?situacion=otra').expect(400);

    const { body: resumen } = await rrhh().get('/rrhh/trabajadores/resumen').expect(200);
    expect(resumen.total).toBe(resumen.activos + resumen.deBaja);
    expect(resumen.fichaPendiente).toBeGreaterThanOrEqual(1);
    expect(resumen.documentoPendiente).toBeGreaterThanOrEqual(1);
  });

  it('no deja ver ni editar proveedores o clientes', async () => {
    await rrhh().get(`/rrhh/trabajadores/${proveedorId}`).expect(404);
    await rrhh().patch(`/rrhh/trabajadores/${proveedorId}`).send({ Anexo: 'NO' }).expect(404);
    await rrhh().get('/rrhh/trabajadores/999999999').expect(404);
  });

  it('el rol de RR.HH. no entra a Anexos ni a los equipos (otros módulos)', async () => {
    await rrhh().get('/maestros/anexo').expect(403);
    await rrhh().post('/maestros/anexo').send({ tipoAnexo: 'Proveedor', Anexo: 'NO' }).expect(403);
    await rrhh().get(`/maestros/anexo/${proveedorId}/equipos`).expect(403);
    // La lista para selectores es de lectura compartida: la sigue viendo.
    await rrhh().get('/maestros/anexo/select?tipoAnexo=Trabajador').expect(200);
  });

  it('Anexos ya no crea, edita ni borra trabajadores', async () => {
    const t = await crear(8);
    const r = await admin().post('/maestros/anexo').send({ tipoAnexo: 'Trabajador', Anexo: 'E2E NO' }).expect(400);
    expect(String(r.body.message)).toContain('RR.HH. › Trabajadores');
    await admin().patch(`/maestros/anexo/${t.id}`).send({ Anexo: 'OTRO' }).expect(400);
    await admin().delete(`/maestros/anexo/${t.id}`).expect(400);
    await admin().patch(`/maestros/anexo/${proveedorId}`).send({ tipoAnexo: 'Trabajador' }).expect(400);
    // Un proveedor se sigue editando normalmente.
    await admin().patch(`/maestros/anexo/${proveedorId}`).send({ Contacto: 'E2E' }).expect(200);
  });
});
