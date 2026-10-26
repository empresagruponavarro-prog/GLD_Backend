import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import JSZip from 'jszip';
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
  let localId = 0;
  let nivelId = 0;
  let ambienteId = 0;
  let areaId = 0;

  const api = () => apiConSesion(app);

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    trabajadorId = (
      await db.query(`insert into anexos ("tipoAnexo", "Anexo", "NumeroDocIde", estado) values ('Trabajador', 'E2E TRABAJADOR', '12345678', true) returning id`)
    ).rows[0].id;
    proveedorId = (
      await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Proveedor', 'E2E PROVEEDOR', true) returning id`)
    ).rows[0].id;

    // Bien propio de la prueba: así no se tocan las características del catálogo real.
    const bien = await db.query(
      `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto, clase_inventario)
       values ('E2E-PC', 'PC DE PRUEBA E2E', (select id from categoria limit 1), (select id from unidad_medida limit 1), 'PRODUCTO', 'ACTIVO_FIJO')
       returning id, codigo`,
    );
    codigoBien = bien.rows[0].codigo;
    productoId = bien.rows[0].id;
    for (const [nombre, valor] of [['Marca', 'Lenovo'], ['Modelo', 'ThinkPad E14'], ['RAM', '16 GB']]) {
      await db.query(`insert into producto_caracteristica (id_producto, nombre, valor) values ($1, $2, $3)`, [productoId, nombre, valor]);
    }
    const ubicacion = await db.query(`select id_local, id_nivel, id_ambiente from ubicacion where estado limit 1`);
    localId = ubicacion.rows[0]?.id_local ?? 0;
    nivelId = ubicacion.rows[0]?.id_nivel ?? 0;
    ambienteId = ubicacion.rows[0]?.id_ambiente ?? 0;

    areaId = (await db.query(`select id from area where estado limit 1`)).rows[0]?.id ?? 0;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await db.query(`delete from activo_fijo where id_responsable in ($1, $2)`, [trabajadorId, proveedorId]);
    await db.query(`delete from activo_fijo where serie like 'E2E-%' or id_producto = $1`, [productoId]);
    await db.query(`delete from anexos where id in ($1, $2)`, [trabajadorId, proveedorId]);
    await db.query(`delete from producto where id = $1`, [productoId]);
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
    areaId,
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
      areaId,
      caracteristicas: { RAM: '32 GB' },
    });
    expect(creado.area).toBeTruthy();
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

  it('genera la hoja de entrega (.docx) con el nombre, DNI, fecha y el equipo', async () => {
    const res = await api()
      .get(`/maestros/anexo/${trabajadorId}/equipos/entrega?fecha=2026-11-05`)
      .buffer(true)
      .parse((r, cb) => {
        const trozos: Buffer[] = [];
        r.on('data', (t: Buffer) => trozos.push(t));
        r.on('end', () => cb(null, Buffer.concat(trozos)));
      })
      .expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    const xml = (await (await JSZip.loadAsync(res.body)).file('word/document.xml')?.async('string')) ?? '';
    const texto = (xml.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('|');
    expect(texto).toContain('E2E TRABAJADOR');
    expect(texto).toContain('12345678');
    expect(texto).toContain('FECHA:|05|/|11|/|2026');
    expect(texto).toContain('|5| |de |Noviembre| del |2026');
    expect(texto).not.toContain('xxx');
    expect(texto).not.toContain('IDEA PAD');
    expect(texto).not.toContain('Estuche');

    await api().get(`/maestros/anexo/${trabajadorId}/equipos/entrega?ids=999999999`).expect(404);
    await api().get(`/maestros/anexo/${proveedorId}/equipos/entrega`).expect(400);
  });

  it('el inventario trae todos los equipos con su responsable', async () => {
    const { body } = await api().get('/maestros/anexo/equipos/inventario').expect(200);
    const propio = body.find((e: { responsable: string | null }) => e.responsable === 'E2E TRABAJADOR');
    expect(propio).toMatchObject({ responsableId: trabajadorId, estado: 'Operativo', cantidad: 1 });
    expect(body.every((e: { tipo?: string }) => typeof e.tipo === 'string')).toBe(true);
  });

  it('un bien sin almacén por defecto (null) se rechaza con un 400 claro, no con un 500', async () => {
    const cuerpo = {
      codigo: 'E2E-SINALM',
      descripcion: 'BIEN SIN ALMACEN E2E',
      id_categoria: (await db.query(`select id from categoria limit 1`)).rows[0].id,
      id_unidad_medida: (await db.query(`select id from unidad_medida limit 1`)).rows[0].id,
      id_almacen_default: null,
    };
    const { body } = await api().post('/maestros/producto').send(cuerpo).expect(400);
    expect(body.message).toContain('almacén');
    await api().patch(`/maestros/producto/${productoId}`).send({ id_almacen_default: null }).expect(400);
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
      // La nueva ubicación necesita local, nivel y ambiente juntos.
      await api()
        .patch(`/maestros/anexo/${trabajadorId}/equipos/${equipoId}/reasignar`)
        .send({ anexoDestinoId: otroId, fechaAsignacion: '2026-10-27', localId })
        .expect(400);
      const { body: movido } = await api()
        .patch(`/maestros/anexo/${trabajadorId}/equipos/${equipoId}/reasignar`)
        .send({ anexoDestinoId: otroId, fechaAsignacion: '2026-10-27', localId, nivelId, ambienteId, areaId })
        .expect(200);
      expect(movido).toMatchObject({ id: equipoId, fechaAsignacion: '2026-10-27' });
      expect((await api().get(`/maestros/anexo/${trabajadorId}/equipos`).expect(200)).body).toEqual([]);
      expect((await api().get(`/maestros/anexo/${otroId}/equipos`).expect(200)).body).toHaveLength(1);

      // Ya no es del primer trabajador.
      await api().patch(`/maestros/anexo/${trabajadorId}/equipos/${equipoId}/devolver`).send({ fecha: '2026-10-28' }).expect(404);
      await api().patch(`/maestros/anexo/${otroId}/equipos/${equipoId}/devolver`).send({ fecha: '2026-10-28' }).expect(200);
      expect((await api().get(`/maestros/anexo/${otroId}/equipos`).expect(200)).body).toEqual([]);
      // El historial conserva la asignación, la reasignación y la devolución (más reciente primero).
      const { body: historial } = await api().get(`/maestros/anexo/equipos/${equipoId}/historial`).expect(200);
      expect(historial.map((m: { movimiento: string }) => m.movimiento)).toEqual(['Devolución', 'Reasignación', 'Asignación']);
      expect(historial[1]).toMatchObject({ responsableAnterior: 'E2E TRABAJADOR', responsableNuevo: 'E2E TRABAJADOR 2', fecha: '2026-10-27' });
      expect(historial[1].areaNueva).toBeTruthy();
      expect(historial[0]).toMatchObject({ responsableAnterior: 'E2E TRABAJADOR 2', responsableNuevo: null, fecha: '2026-10-28' });
      const fila = await db.query(`select id_responsable, fecha_asignacion from activo_fijo where id = $1`, [equipoId]);
      expect(fila.rows[0]).toEqual({ id_responsable: null, fecha_asignacion: null });
    } finally {
      await db.query(`delete from anexos where id = $1`, [otroId]);
    }
  });
});
