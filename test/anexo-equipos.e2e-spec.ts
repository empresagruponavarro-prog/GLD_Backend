import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Equipos tecnológicos por trabajador (maestro de activos fijos) contra la BD de DATABASE_URL.
 * Crea su propio anexo Trabajador y Proveedor, y borra lo que asigna al terminar.
 */
describe('Equipos asignados a un trabajador (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let trabajadorId = 0;
  let proveedorId = 0;
  let codigoBien = '';
  let productoId = 0;
  /** Características que este test agregó al catálogo (se borran al final). */
  let caracteristicasSembradas: number[] = [];
  let localId = 0;
  let nivelId = 0;
  let ambienteId = 0;

  const api = () => apiConSesion(app);

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    trabajadorId = (
      await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Trabajador', 'E2E TRABAJADOR', true) returning id`)
    ).rows[0].id;
    proveedorId = (
      await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Proveedor', 'E2E PROVEEDOR', true) returning id`)
    ).rows[0].id;

    const bien = await db.query(`select id, codigo from producto where clase_inventario = 'ACTIVO_FIJO' and estado limit 1`);
    codigoBien = bien.rows[0]?.codigo ?? '';
    productoId = bien.rows[0]?.id ?? 0;
    // El catálogo define Marca, Modelo y RAM del bien; si ya existen, no se tocan.
    for (const [nombre, valor] of [['Marca', 'Lenovo'], ['Modelo', 'ThinkPad E14'], ['RAM', '16 GB']]) {
      const r = await db.query(
        `insert into producto_caracteristica (id_producto, nombre, valor) values ($1, $2, $3) on conflict do nothing returning id`,
        [productoId, nombre, valor],
      );
      caracteristicasSembradas.push(...r.rows.map((f: { id: number }) => f.id));
    }
    const ubicacion = await db.query(`select id_local, id_nivel, id_ambiente from ubicacion where estado limit 1`);
    localId = ubicacion.rows[0]?.id_local ?? 0;
    nivelId = ubicacion.rows[0]?.id_nivel ?? 0;
    ambienteId = ubicacion.rows[0]?.id_ambiente ?? 0;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await db.query(`delete from activo_fijo where id_responsable in ($1, $2)`, [trabajadorId, proveedorId]);
    await db.query(`delete from activo_fijo where serie like 'E2E-%'`);
    await db.query(`delete from anexos where id in ($1, $2)`, [trabajadorId, proveedorId]);
    await db.query(`delete from producto_caracteristica where id = any($1::int[])`, [caracteristicasSembradas]);
    await borrarUsuarioE2E(db);
    await db.end();
    await app.close();
  });

  const cuerpo = () => ({
    codigoBien,
    serie: `E2E-${Date.now()}`,
    fechaAsignacion: '2026-10-26',
    localId,
    nivelId,
    ambienteId,
    caracteristicas: { RAM: '32 GB' },
  });

  it('las opciones traen el catálogo de activos fijos y el árbol de ubicaciones', async () => {
    const { body } = await api().get('/maestros/anexo/equipos/opciones').expect(200);
    const bien = body.catalogo.find((b: { codigo: string }) => b.codigo === codigoBien);
    expect(bien.caracteristicas).toMatchObject({ Marca: expect.any(String), RAM: expect.any(String) });
    const local = body.locales.find((l: { id: number }) => l.id === localId);
    expect(local.niveles.find((n: { id: number }) => n.id === nivelId).ambientes.map((a: { id: number }) => a.id)).toContain(ambienteId);
  });

  it('un trabajador sin equipos devuelve lista vacía', async () => {
    const { body } = await api().get(`/maestros/anexo/${trabajadorId}/equipos`).expect(200);
    expect(body).toEqual([]);
  });

  it('asigna un equipo que hereda las características del catálogo y guarda solo las que cambian', async () => {
    const enviado = cuerpo();
    const { body: creado } = await api().post(`/maestros/anexo/${trabajadorId}/equipos`).send(enviado).expect(201);
    expect(creado).toMatchObject({
      codigo: codigoBien,
      estado: 'Operativo',
      cantidad: 1,
      fechaAsignacion: '2026-10-26',
      localId,
      nivelId,
      ambienteId,
      caracteristicas: { RAM: '32 GB' },
    });
    expect(creado.marca).toBeTruthy();
    expect(creado.codigoActivo).toMatch(/^AF-\d{4,}$/);

    const { body: lista } = await api().get(`/maestros/anexo/${trabajadorId}/equipos`).expect(200);
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe(creado.id);

    // Solo la RAM difiere del catálogo: es lo único que se guarda en la unidad.
    const propias = await db.query(`select nombre, valor from activo_fijo_caracteristica where id_activo_fijo = $1`, [creado.id]);
    expect(propias.rows).toEqual([{ nombre: 'RAM', valor: '32 GB' }]);

    // La misma serie del mismo bien no se puede repetir.
    await api().post(`/maestros/anexo/${trabajadorId}/equipos`).send({ ...cuerpo(), serie: enviado.serie }).expect(409);
  });

  it('rechaza anexos que no son trabajadores y bienes que no están en el catálogo', async () => {
    await api().get(`/maestros/anexo/${proveedorId}/equipos`).expect(400);
    await api().post(`/maestros/anexo/${proveedorId}/equipos`).send(cuerpo()).expect(400);
    await api().post(`/maestros/anexo/${trabajadorId}/equipos`).send({ ...cuerpo(), codigoBien: 'NO-EXISTE' }).expect(400);
    await api().get('/maestros/anexo/999999999/equipos').expect(404);
  });

  it('las características del catálogo se leen y se reemplazan por producto', async () => {
    const antes = (await api().get(`/maestros/producto/${productoId}/caracteristicas`).expect(200)).body;
    try {
      const { body } = await api()
        .put(`/maestros/producto/${productoId}/caracteristicas`)
        .send({ caracteristicas: [{ nombre: 'Marca', valor: 'HP' }, { nombre: 'Procesador', valor: 'Ryzen 5' }] })
        .expect(200);
      expect(body).toHaveLength(2);
      expect(body).toEqual(expect.arrayContaining([{ nombre: 'Marca', valor: 'HP' }, { nombre: 'Procesador', valor: 'Ryzen 5' }]));
      await api()
        .put(`/maestros/producto/${productoId}/caracteristicas`)
        .send({ caracteristicas: [{ nombre: 'Marca', valor: 'a' }, { nombre: 'marca', valor: 'b' }] })
        .expect(400);
      await api().put('/maestros/producto/999999999/caracteristicas').send({ caracteristicas: [] }).expect(404);
    } finally {
      await api().put(`/maestros/producto/${productoId}/caracteristicas`).send({ caracteristicas: antes }).expect(200);
    }
  });

  it('reasigna un equipo a otro trabajador y lo devuelve', async () => {
    const otroId = (
      await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Trabajador', 'E2E TRABAJADOR 2', true) returning id`)
    ).rows[0].id;
    try {
      const { body: lista } = await api().get(`/maestros/anexo/${trabajadorId}/equipos`).expect(200);
      const equipoId: number = lista[0].id;

      await api()
        .patch(`/maestros/anexo/${trabajadorId}/equipos/${equipoId}/reasignar`)
        .send({ anexoDestinoId: trabajadorId, fechaAsignacion: '2026-10-27' })
        .expect(400);
      await api()
        .patch(`/maestros/anexo/${trabajadorId}/equipos/${equipoId}/reasignar`)
        .send({ anexoDestinoId: proveedorId, fechaAsignacion: '2026-10-27' })
        .expect(400);
      const { body: movido } = await api()
        .patch(`/maestros/anexo/${trabajadorId}/equipos/${equipoId}/reasignar`)
        .send({ anexoDestinoId: otroId, fechaAsignacion: '2026-10-27' })
        .expect(200);
      expect(movido).toMatchObject({ id: equipoId, fechaAsignacion: '2026-10-27' });
      expect((await api().get(`/maestros/anexo/${trabajadorId}/equipos`).expect(200)).body).toEqual([]);
      expect((await api().get(`/maestros/anexo/${otroId}/equipos`).expect(200)).body).toHaveLength(1);

      // Ya no es del primer trabajador.
      await api().patch(`/maestros/anexo/${trabajadorId}/equipos/${equipoId}/devolver`).expect(404);
      await api().patch(`/maestros/anexo/${otroId}/equipos/${equipoId}/devolver`).expect(200);
      expect((await api().get(`/maestros/anexo/${otroId}/equipos`).expect(200)).body).toEqual([]);
      const fila = await db.query(`select id_responsable, fecha_asignacion from activo_fijo where id = $1`, [equipoId]);
      expect(fila.rows[0]).toEqual({ id_responsable: null, fecha_asignacion: null });
    } finally {
      await db.query(`delete from anexos where id = $1`, [otroId]);
    }
  });
});
