import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

/**
 * Flujo de compras contra la BD de DATABASE_URL:
 * FUR -> aprobacion -> documento origen (OC) -> recepcion en almacen -> kardex.
 * Crea sus propios productos (ZZ-FUR-*), requerimientos y OC, y los elimina al final.
 */
describe('Compras: FUR, OC y recepción (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let trabajadorId = 0;
  let proveedorId = 0;
  let centroCostoId = 0;
  let productoId = 0;
  let servicioId = 0;
  const requerimientoIds: number[] = [];
  const ocIds: number[] = [];

  const api = () => request(app.getHttpServer());
  const num = (v: string | number) => Number(v);

  async function crearItem(tipo: 'PRODUCTO' | 'SERVICIO'): Promise<number> {
    const r = await db.query(
      `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto)
       values ($1, $2, 1, 1, $3) returning id`,
      [`ZZ-FUR-${Math.random().toString(36).slice(2, 8)}`, `${tipo} DE PRUEBA FUR`, tipo],
    );
    return r.rows[0].id;
  }

  async function crearFur(lineas: Array<{ id_producto: number; cantidad: string }>, extra: Record<string, unknown> = {}) {
    const res = await api()
      .post('/requerimientos')
      .send({
        fecha: '2026-10-10',
        id_centro_costo: centroCostoId,
        id_solicitante: trabajadorId,
        justificacion: 'Prueba e2e del flujo de compras',
        lineas,
        ...extra,
      })
      .expect(201);
    requerimientoIds.push(res.body.id);
    return res.body;
  }

  async function aprobarFur(id: number, lineas?: Array<{ id_detalle: number; cantidad_aprobada: string }>) {
    await api().post(`/requerimientos/${id}/enviar`).send({}).expect(200);
    return api()
      .post(`/requerimientos/${id}/aprobar`)
      .send({ id_aprobador: trabajadorId, comentario: 'OK', ...(lineas ? { lineas } : {}) });
  }

  const detalleOc = (idProducto: number, cantidad: number, precio: number, idDetalleFur?: number) => ({
    id_producto: idProducto,
    cantidad,
    precio,
    ...(idDetalleFur ? { id_requerimiento_detalle: idDetalleFur } : {}),
  });

  async function crearOc(body: Record<string, unknown>) {
    const res = await api()
      .post('/documentos/origen')
      .send({ id_anexo: proveedorId, moneda_simbolo: 'S/', moneda_id: 'PEN', ...body });
    if (res.status === 201) ocIds.push(res.body.id);
    return res;
  }

  async function stockProducto(id: number) {
    const p = (await db.query('select stock::numeric as stock from producto where id = $1', [id])).rows[0];
    return num(p.stock);
  }

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    trabajadorId = (await db.query(`select id from anexos where "tipoAnexo" = 'Trabajador' limit 1`)).rows[0].id;
    proveedorId = (await db.query(`select id from anexos where "tipoAnexo" = 'Proveedor' limit 1`)).rows[0].id;
    centroCostoId = (await db.query(`select id from "CentroCostos" limit 1`)).rows[0].id;
    productoId = await crearItem('PRODUCTO');
    servicioId = await crearItem('SERVICIO');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    const productos = [productoId, servicioId].filter(Boolean);
    if (productos.length > 0) {
      const docs = (
        await db.query('select distinct id_documento from almacen_documento_detalle where id_producto = any($1)', [productos])
      ).rows.map((x) => x.id_documento);
      await db.query('delete from almacen_kardex where id_producto = any($1)', [productos]);
      await db.query('delete from almacen_documento_detalle where id_producto = any($1)', [productos]);
      await db.query('update almacen_documento set id_documento_anula = null where id_documento_anula = any($1)', [docs]);
      await db.query('delete from almacen_documento where id = any($1)', [docs]);
      await db.query('delete from stock_almacen where id_producto = any($1)', [productos]);
    }
    if (ocIds.length > 0) {
      await db.query('delete from "ordenCompraDetalle" where id_orden_compra = any($1)', [ocIds]);
      await db.query('delete from "documentosOrigen" where id = any($1)', [ocIds]);
    }
    if (requerimientoIds.length > 0) await db.query('delete from requerimiento where id = any($1)', [requerimientoIds]);
    if (productos.length > 0) await db.query('delete from producto where id = any($1)', [productos]);
    await db.end();
    await app?.close();
  });

  it('valida el requerimiento al crearlo', async () => {
    const base = {
      fecha: '2026-10-10',
      id_centro_costo: centroCostoId,
      id_solicitante: trabajadorId,
      justificacion: 'x',
    };
    await api()
      .post('/requerimientos')
      .send({ ...base, lineas: [{ id_producto: productoId, cantidad: '1' }, { id_producto: productoId, cantidad: '2' }] })
      .expect(400);
    await api().post('/requerimientos').send({ ...base, lineas: [{ id_producto: productoId, cantidad: '0' }] }).expect(400);
    await api().post('/requerimientos').send({ ...base, id_solicitante: proveedorId, lineas: [{ id_producto: productoId, cantidad: '1' }] }).expect(400);
    await api().post('/requerimientos').send({ ...base, lineas: [{ id_producto: 999999999, cantidad: '1' }] }).expect(400);
  });

  it('recorre FUR -> aprobación -> OC -> recepciones parciales -> anulación', async () => {
    // --- FUR con un producto y un servicio
    const fur = await crearFur([
      { id_producto: productoId, cantidad: '10' },
      { id_producto: servicioId, cantidad: '1' },
    ]);
    expect(fur.estado).toBe('BORRADOR');
    expect(fur.numero).toMatch(/^FUR-\d{6}$/);
    expect(fur.eventos.map((e: { accion: string }) => e.accion)).toEqual(['CREAR']);

    // Un FUR que no está aprobado no genera OC.
    const lineaP0 = fur.lineas.find((l: { id_producto: number }) => l.id_producto === productoId);
    const sinAprobar = await crearOc({ id_requerimiento: fur.id, detalles: [detalleOc(productoId, 1, 10, lineaP0.id)] });
    expect(sinAprobar.status).toBe(409);

    // --- Flujo de aprobación: enviar, observar, corregir y reenviar
    await api().post(`/requerimientos/${fur.id}/enviar`).send({}).expect(200);
    await api().patch(`/requerimientos/${fur.id}`).send({ justificacion: 'cambio' }).expect(409);
    await api().post(`/requerimientos/${fur.id}/observar`).send({ id_aprobador: trabajadorId }).expect(400);
    await api().post(`/requerimientos/${fur.id}/observar`).send({ id_aprobador: trabajadorId, comentario: 'Detallar cantidades' }).expect(200);
    const editado = await api().patch(`/requerimientos/${fur.id}`).send({ justificacion: 'Detallado' }).expect(200);
    expect(editado.body.justificacion).toBe('Detallado');
    expect(editado.body.estado).toBe('OBSERVADO');
    await api().post(`/requerimientos/${fur.id}/enviar`).send({}).expect(200);

    // El aprobador no puede aprobar más de lo pedido, una línea ajena ni con un aprobador que no es Trabajador.
    const lineaP = fur.lineas.find((l: { id_producto: number }) => l.id_producto === productoId);
    const lineaS = fur.lineas.find((l: { id_producto: number }) => l.id_producto === servicioId);
    await api().post(`/requerimientos/${fur.id}/aprobar`).send({ id_aprobador: trabajadorId, lineas: [{ id_detalle: lineaP.id, cantidad_aprobada: '11' }] }).expect(400);
    await api().post(`/requerimientos/${fur.id}/aprobar`).send({ id_aprobador: trabajadorId, lineas: [{ id_detalle: 999999999, cantidad_aprobada: '1' }] }).expect(400);
    await api().post(`/requerimientos/${fur.id}/aprobar`).send({ id_aprobador: proveedorId }).expect(400);
    expect((await api().get(`/requerimientos/${fur.id}`).expect(200)).body.estado).toBe('ENVIADO');

    const aprobado = await api()
      .post(`/requerimientos/${fur.id}/aprobar`)
      .send({ id_aprobador: trabajadorId, comentario: 'Aprobado con recorte', lineas: [{ id_detalle: lineaP.id, cantidad_aprobada: '8' }] })
      .expect(200);
    expect(aprobado.body.estado).toBe('APROBADO');
    expect(num(aprobado.body.lineas.find((l: { id: number }) => l.id === lineaP.id).cantidad_aprobada)).toBe(8);
    expect(num(aprobado.body.lineas.find((l: { id: number }) => l.id === lineaS.id).cantidad_aprobada)).toBe(1);
    expect(aprobado.body.avance).toBe('SIN_ATENDER');
    expect(aprobado.body.eventos.map((e: { accion: string }) => e.accion)).toEqual([
      'CREAR', 'ENVIAR', 'OBSERVAR', 'ENVIAR', 'APROBAR',
    ]);
    await api().post(`/requerimientos/${fur.id}/aprobar`).send({ id_aprobador: trabajadorId }).expect(409);

    const pendientes = await api().get('/requerimientos/pendientes-oc').expect(200);
    expect(pendientes.body.some((r: { id: number }) => r.id === fur.id)).toBe(true);

    // --- OC 1: 5 del producto (de 8 aprobados) y el servicio
    const oc1 = await crearOc({
      id_oc: 'ZZ-FUR-OC1',
      numero_oc: 'ZZ-0001',
      id_requerimiento: fur.id,
      igv: 0,
      detalles: [detalleOc(productoId, 5, 20, lineaP.id), detalleOc(servicioId, 1, 100, lineaS.id)],
    });
    expect(oc1.status).toBe(201);
    expect(oc1.body.id_requerimiento).toBe(fur.id);
    expect(oc1.body.numero_requerimiento).toBe(fur.numero);
    expect(oc1.body.id_centro_costo).toBe(centroCostoId);
    expect(oc1.body.estado_recepcion).toBe('PENDIENTE');
    expect(oc1.body.detalles).toHaveLength(2);
    const ocLineaP = oc1.body.detalles.find((d: { id_producto: number }) => d.id_producto === productoId);
    const ocLineaS = oc1.body.detalles.find((d: { id_producto: number }) => d.id_producto === servicioId);
    expect(num(ocLineaP.saldo_por_recibir)).toBe(5);
    expect(ocLineaS.saldo_por_recibir).toBeNull();

    let estadoFur = (await api().get(`/requerimientos/${fur.id}`).expect(200)).body;
    expect(estadoFur.avance).toBe('PARCIAL');
    expect(num(estadoFur.lineas.find((l: { id: number }) => l.id === lineaP.id).saldo_por_ordenar)).toBe(3);
    expect(estadoFur.ordenes_compra).toHaveLength(1);

    // Reglas del saldo aprobado
    const exceso = await crearOc({ id_requerimiento: fur.id, detalles: [detalleOc(productoId, 4, 20, lineaP.id)] });
    expect(exceso.status).toBe(400);
    expect(String(exceso.body.message)).toContain('saldo aprobado');
    expect((await crearOc({ id_requerimiento: fur.id, detalles: [detalleOc(productoId, 1, 20)] })).status).toBe(400);
    expect((await crearOc({ id_requerimiento: fur.id, detalles: [detalleOc(servicioId, 1, 20, lineaP.id)] })).status).toBe(400);
    expect((await crearOc({ detalles: [detalleOc(productoId, 1, 20, lineaP.id)] })).status).toBe(400);
    await api().post(`/requerimientos/${fur.id}/anular`).send({}).expect(409);

    // --- OC 2 completa el saldo del FUR
    const oc2 = await crearOc({ id_requerimiento: fur.id, numero_oc: 'ZZ-0002', detalles: [detalleOc(productoId, 3, 21, lineaP.id)] });
    expect(oc2.status).toBe(201);
    estadoFur = (await api().get(`/requerimientos/${fur.id}`).expect(200)).body;
    expect(estadoFur.avance).toBe('ATENDIDO');
    expect((await api().get('/requerimientos/pendientes-oc').expect(200)).body.some((r: { id: number }) => r.id === fur.id)).toBe(false);

    // Reducir la OC 2 libera saldo; ampliarla de nuevo respeta el tope.
    await api().patch(`/documentos/origen/${oc2.body.id}`).send({ detalles: [detalleOc(productoId, 2, 21, lineaP.id)] }).expect(200);
    expect(num((await api().get(`/requerimientos/${fur.id}`).expect(200)).body.lineas.find((l: { id: number }) => l.id === lineaP.id).saldo_por_ordenar)).toBe(1);
    await api().patch(`/documentos/origen/${oc2.body.id}`).send({ detalles: [detalleOc(productoId, 4, 21, lineaP.id)] }).expect(400);
    await api().patch(`/documentos/origen/${oc2.body.id}`).send({ detalles: [detalleOc(productoId, 3, 21, lineaP.id)] }).expect(200);
    await api().patch(`/documentos/origen/${oc2.body.id}`).send({ id_requerimiento: 123456 }).expect(400);

    // --- Recepción de la OC 1
    const lista = await api().get('/almacen/recepciones/pendientes').expect(200);
    expect(lista.body.some((o: { id: number }) => o.id === oc1.body.id)).toBe(true);

    const info = await api().get(`/almacen/recepciones/orden-compra/${oc1.body.id}`).expect(200);
    expect(info.body.numero_requerimiento).toBe(fur.numero);
    expect(info.body.es_soles).toBe(true);
    expect(info.body.lineas).toHaveLength(1);
    expect(info.body.lineas[0].id_producto).toBe(productoId);
    expect(info.body.no_recibibles).toHaveLength(1);
    expect(info.body.no_recibibles[0].motivo).toContain('Servicio');

    const recibir = (cantidad: string, idLinea = ocLineaP.id, extra: Record<string, unknown> = {}, idOc = oc1.body.id) =>
      api()
        .post('/almacen/recepciones')
        .send({ id_orden_compra: idOc, id_almacen: 1, fecha: '2026-10-11', lineas: [{ id_orden_compra_detalle: idLinea, cantidad }], ...extra });

    expect((await recibir('1', ocLineaS.id)).status).toBe(400); // servicio
    expect((await recibir('6')).status).toBe(400); // supera el saldo
    expect((await recibir('0')).status).toBe(400);
    expect((await recibir('1', 999999999)).status).toBe(400); // línea ajena
    expect(await stockProducto(productoId)).toBe(0);

    const r1 = await recibir('3').expect(201);
    expect(r1.body.naturaleza).toBe('INGRESO');
    expect(r1.body.motivo).toBe('COMPRA');
    expect(r1.body.id_orden_compra).toBe(oc1.body.id);
    expect(r1.body.numero_oc).toBe('ZZ-0001');
    expect(r1.body.id_proveedor).toBe(proveedorId);
    expect(r1.body.id_centro_costo).toBe(centroCostoId);
    expect(num(r1.body.lineas[0].costo_unitario)).toBe(20);
    expect(r1.body.lineas[0].id_orden_compra_detalle).toBe(ocLineaP.id);
    expect(await stockProducto(productoId)).toBe(3);

    let oc = (await api().get(`/documentos/origen/${oc1.body.id}`).expect(200)).body;
    expect(oc.estado_recepcion).toBe('PARCIAL');
    expect(num(oc.detalles.find((d: { id: number }) => d.id === ocLineaP.id).saldo_por_recibir)).toBe(2);

    // Mientras la OC tenga ingresos, su detalle no cambia ni se elimina.
    await api().patch(`/documentos/origen/${oc1.body.id}`).send({ detalles: [detalleOc(productoId, 5, 20, lineaP.id)] }).expect(409);
    await api().delete(`/documentos/origen/${oc1.body.id}`).expect(409);
    await api().patch(`/documentos/origen/${oc1.body.id}`).send({ comentarios: 'solo cabecera' }).expect(200);

    const r2 = await recibir('2').expect(201);
    oc = (await api().get(`/documentos/origen/${oc1.body.id}`).expect(200)).body;
    expect(oc.estado_recepcion).toBe('RECIBIDA');
    expect(await stockProducto(productoId)).toBe(5);
    expect((await recibir('1')).status).toBe(400);
    expect((await api().get('/almacen/recepciones/pendientes').expect(200)).body.some((o: { id: number }) => o.id === oc1.body.id)).toBe(false);

    // Anular un ingreso libera el saldo de la OC.
    await api().post(`/almacen/ingresos/${r2.body.id}/anular`).expect(200);
    oc = (await api().get(`/documentos/origen/${oc1.body.id}`).expect(200)).body;
    expect(oc.estado_recepcion).toBe('PARCIAL');
    expect(num(oc.detalles.find((d: { id: number }) => d.id === ocLineaP.id).saldo_por_recibir)).toBe(2);
    expect(await stockProducto(productoId)).toBe(3);
    await recibir('2').expect(201);
    expect(await stockProducto(productoId)).toBe(5);

    // Una OC con ingresos (aunque estén anulados) no se puede eliminar.
    await api().delete(`/documentos/origen/${oc1.body.id}`).expect(409);

    // El ingreso aparece ligado a la OC en el listado de ingresos.
    const ingresos = await api().get('/almacen/ingresos').query({ motivo: 'COMPRA', pageSize: 5 }).expect(200);
    expect(ingresos.body.data.some((i: { numero_oc: string | null }) => i.numero_oc === 'ZZ-0001')).toBe(true);
  });

  it('una OC sin requerimiento en dólares exige tipo de cambio y valoriza en soles', async () => {
    const oc = await crearOc({
      numero_oc: 'ZZ-USD',
      moneda_simbolo: '$',
      moneda_id: 'USD',
      detalles: [detalleOc(productoId, 2, 10)],
    });
    expect(oc.status).toBe(201);
    expect(oc.body.id_requerimiento).toBeNull();
    expect(oc.body.numero_requerimiento).toBeNull();
    const linea = oc.body.detalles[0];
    const base = { id_orden_compra: oc.body.id, id_almacen: 1, fecha: '2026-10-12', lineas: [{ id_orden_compra_detalle: linea.id, cantidad: '2' }] };

    const info = await api().get(`/almacen/recepciones/orden-compra/${oc.body.id}`).expect(200);
    expect(info.body.es_soles).toBe(false);
    await api().post('/almacen/recepciones').send(base).expect(400);
    await api().post('/almacen/recepciones').send({ ...base, tipo_cambio: '0' }).expect(400);

    const stockAntes = await stockProducto(productoId);
    const r = await api().post('/almacen/recepciones').send({ ...base, tipo_cambio: '3.75' }).expect(201);
    expect(num(r.body.lineas[0].costo_unitario)).toBeCloseTo(37.5, 4);
    expect(await stockProducto(productoId)).toBe(stockAntes + 2);

    // Una OC solo con servicios no tiene nada que recibir.
    const ocServicio = await crearOc({ numero_oc: 'ZZ-SRV', detalles: [detalleOc(servicioId, 1, 50)] });
    expect(ocServicio.status).toBe(201);
    expect(ocServicio.body.estado_recepcion).toBe('SIN_BIENES');
    await api()
      .post('/almacen/recepciones')
      .send({ id_orden_compra: ocServicio.body.id, id_almacen: 1, fecha: '2026-10-12', lineas: [{ id_orden_compra_detalle: ocServicio.body.detalles[0].id, cantidad: '1' }] })
      .expect(400);
  });

  it('dos peticiones simultáneas no pueden superar el saldo (OC y recepción)', async () => {
    const fur = await crearFur([{ id_producto: productoId, cantidad: '4' }]);
    const aprobado = await aprobarFur(fur.id);
    expect(aprobado.status).toBe(200);
    const linea = fur.lineas[0];

    // Dos OC de 3 sobre un saldo de 4: solo una puede crearse.
    const ocs = await Promise.all([
      crearOc({ id_requerimiento: fur.id, numero_oc: 'ZZ-RACE-1', detalles: [detalleOc(productoId, 3, 10, linea.id)] }),
      crearOc({ id_requerimiento: fur.id, numero_oc: 'ZZ-RACE-2', detalles: [detalleOc(productoId, 3, 10, linea.id)] }),
    ]);
    expect(ocs.map((r) => r.status).sort()).toEqual([201, 400]);
    const oc = ocs.find((r) => r.status === 201)!;
    const ocLinea = oc.body.detalles[0];
    const estado = (await api().get(`/requerimientos/${fur.id}`).expect(200)).body;
    expect(num(estado.lineas[0].cantidad_ordenada)).toBe(3);

    // Dos recepciones de 2 sobre un saldo de 3: solo una puede registrarse.
    const antes = await stockProducto(productoId);
    const recepcion = () =>
      api()
        .post('/almacen/recepciones')
        .send({ id_orden_compra: oc.body.id, id_almacen: 1, fecha: '2026-10-13', lineas: [{ id_orden_compra_detalle: ocLinea.id, cantidad: '2' }] });
    const recepciones = await Promise.all([recepcion(), recepcion()]);
    expect(recepciones.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await stockProducto(productoId)).toBe(antes + 2);
    const final = (await api().get(`/documentos/origen/${oc.body.id}`).expect(200)).body;
    expect(num(final.detalles[0].saldo_por_recibir)).toBe(1);
  });

  it('rechazar, anular y eliminar requerimientos', async () => {
    const fur = await crearFur([{ id_producto: productoId, cantidad: '2' }]);
    await api().post(`/requerimientos/${fur.id}/aprobar`).send({ id_aprobador: trabajadorId }).expect(409); // aún en BORRADOR
    await api().post(`/requerimientos/${fur.id}/enviar`).send({}).expect(200);
    await api().post(`/requerimientos/${fur.id}/rechazar`).send({ id_aprobador: trabajadorId }).expect(400);
    const rechazado = await api().post(`/requerimientos/${fur.id}/rechazar`).send({ id_aprobador: trabajadorId, comentario: 'Sin presupuesto' }).expect(200);
    expect(rechazado.body.estado).toBe('RECHAZADO');
    expect(rechazado.body.comentario_aprobacion).toBe('Sin presupuesto');
    await api().post(`/requerimientos/${fur.id}/enviar`).send({}).expect(409);
    await api().post(`/requerimientos/${fur.id}/anular`).send({}).expect(409);
    await api().delete(`/requerimientos/${fur.id}`).expect(409);

    const aprobable = await crearFur([{ id_producto: productoId, cantidad: '2' }]);
    expect((await aprobarFur(aprobable.id, [{ id_detalle: aprobable.lineas[0].id, cantidad_aprobada: '0' }])).status).toBe(400);
    const anulado = await api().post(`/requerimientos/${aprobable.id}/anular`).send({ comentario: 'Ya no se necesita' }).expect(200);
    expect(anulado.body.estado).toBe('ANULADO');

    const borrador = await crearFur([{ id_producto: productoId, cantidad: '1' }]);
    await api().delete(`/requerimientos/${borrador.id}`).expect(200);
    await api().get(`/requerimientos/${borrador.id}`).expect(404);

    const lista = await api().get('/requerimientos').query({ estado: 'RECHAZADO', search: fur.numero }).expect(200);
    expect(lista.body.data.map((r: { id: number }) => r.id)).toContain(fur.id);
  });
});
