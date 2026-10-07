import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

/**
 * Prueba de integracion del control de almacen contra la BD de DATABASE_URL.
 * Crea sus propios productos (codigo ZZ-TEST-*) y familia (ZZT) y los elimina al final.
 */
describe('Control de almacén (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  const productoIds: number[] = [];
  let familiaId = 0;
  let trabajadorId = 0;

  const api = () => request(app.getHttpServer());
  const num = (v: string | number) => Number(v);

  async function crearProducto(extra: Record<string, unknown> = {}): Promise<number> {
    const r = await db.query(
      `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, clase_inventario, stock_minimo, stock_objetivo)
       values ($1, $2, 1, 1, $3, $4, $5) returning id`,
      [
        `ZZ-TEST-${Math.random().toString(36).slice(2, 8)}`,
        (extra['descripcion'] as string) ?? 'PRODUCTO DE PRUEBA ALMACEN',
        (extra['clase'] as string) ?? 'CONSUMIBLE',
        (extra['min'] as string) ?? '0',
        (extra['obj'] as string) ?? '0',
      ],
    );
    productoIds.push(r.rows[0].id);
    return r.rows[0].id;
  }

  const linea = (id: number, cantidad: string, costo?: string) => [
    { id_producto: id, cantidad, ...(costo ? { costo_unitario: costo } : {}) },
  ];

  async function estado(id: number) {
    const p = (await db.query('select stock::numeric as stock, costo_promedio::numeric as costo from producto where id=$1', [id])).rows[0];
    const s = (
      await db.query(
        'select id_almacen, cantidad::numeric c, cantidad_prestada::numeric p, cantidad_no_operativa::numeric n from stock_almacen where id_producto=$1 order by id_almacen',
        [id],
      )
    ).rows;
    return { stock: num(p.stock), costo: num(p.costo), almacenes: s.map((x) => ({ a: x.id_almacen, c: num(x.c), p: num(x.p), n: num(x.n) })) };
  }

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    trabajadorId = (await db.query(`select id from anexos where "tipoAnexo" = 'Trabajador' limit 1`)).rows[0].id;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (productoIds.length > 0) {
      const docs = (await db.query('select distinct id_documento from almacen_documento_detalle where id_producto = any($1)', [productoIds])).rows.map((x) => x.id_documento);
      const pres = (await db.query('select distinct id_prestamo from almacen_prestamo_detalle where id_producto = any($1)', [productoIds])).rows.map((x) => x.id_prestamo);
      await db.query('delete from almacen_kardex where id_producto = any($1)', [productoIds]);
      await db.query('delete from almacen_prestamo_retorno where id_prestamo_detalle in (select id from almacen_prestamo_detalle where id_producto = any($1))', [productoIds]);
      await db.query('delete from almacen_prestamo_detalle where id_producto = any($1)', [productoIds]);
      await db.query('delete from almacen_prestamo where id = any($1)', [pres]);
      await db.query('delete from almacen_documento_detalle where id_producto = any($1)', [productoIds]);
      await db.query('update almacen_documento set id_documento_anula = null where id_documento_anula = any($1)', [docs]);
      await db.query('delete from almacen_documento where id = any($1)', [docs]);
      await db.query('delete from stock_almacen where id_producto = any($1)', [productoIds]);
      await db.query('delete from producto_alternativa where id_producto = any($1) or id_producto_alternativo = any($1)', [productoIds]);
      await db.query('delete from producto where id = any($1)', [productoIds]);
    }
    if (familiaId) await db.query('delete from familia_almacen where id = $1', [familiaId]);
    await db.end();
    await app.close();
  });

  it('asigna códigos automáticos correlativos por familia', async () => {
    const fam = await api().post('/maestros/familia-almacen').send({ prefijo: 'ZZT', nombre: 'FAMILIA DE PRUEBA' }).expect(201);
    familiaId = fam.body.id;
    const a = await api().post('/maestros/producto').send({ descripcion: 'T1', id_categoria: 1, id_unidad_medida: 1, id_familia: familiaId }).expect(201);
    const b = await api().post('/maestros/producto').send({ descripcion: 'T2', id_categoria: 1, id_unidad_medida: 1, id_familia: familiaId }).expect(201);
    productoIds.push(a.body.id, b.body.id);
    expect(a.body.codigo).toBe('ZZT-0001');
    expect(b.body.codigo).toBe('ZZT-0002');
    await api().post('/maestros/familia-almacen').send({ prefijo: 'ZZT', nombre: 'DUP' }).expect(409);
    await api().patch(`/maestros/producto/${a.body.id}`).send({ codigo: 'OTRO' }).expect(400);
  });

  it('inventario inicial, compra, salida, transferencia y anulación valorizan por promedio móvil', async () => {
    const id = await crearProducto();
    await api().post('/almacen/inventario-inicial').send({ fecha: '2026-10-01', motivo: 'INVENTARIO_INICIAL', id_almacen: 1, lineas: linea(id, '50', '20') }).expect(201);
    await api().post('/almacen/inventario-inicial').send({ fecha: '2026-10-01', motivo: 'INVENTARIO_INICIAL', id_almacen: 1, lineas: linea(id, '5', '20') }).expect(409);

    const compra = await api().post('/almacen/ingresos').send({ fecha: '2026-10-02', motivo: 'COMPRA', id_almacen: 1, lineas: linea(id, '36', '22') }).expect(201);
    let e = await estado(id);
    expect(e.stock).toBe(86);
    expect(e.costo).toBeCloseTo((50 * 20 + 36 * 22) / 86, 5);

    const salida = await api().post('/almacen/salidas').send({ fecha: '2026-10-03', motivo: 'CONSUMO', id_almacen: 1, lineas: linea(id, '10') }).expect(201);
    expect(num(salida.body.lineas[0].costo_unitario)).toBeCloseTo(e.costo, 5);
    e = await estado(id);
    expect(e.stock).toBe(76);

    const exceso = await api().post('/almacen/salidas').send({ fecha: '2026-10-03', motivo: 'CONSUMO', id_almacen: 1, lineas: linea(id, '1000') }).expect(409);
    expect(String(exceso.body.message)).toContain('Stock insuficiente');
    expect((await estado(id)).stock).toBe(76);

    await api().post('/almacen/transferencias').send({ fecha: '2026-10-04', motivo: 'TRANSFERENCIA', id_almacen: 1, id_almacen_destino: 2, lineas: linea(id, '6') }).expect(201);
    e = await estado(id);
    expect(e.stock).toBe(76);
    expect(e.almacenes).toEqual([{ a: 1, c: 70, p: 0, n: 0 }, { a: 2, c: 6, p: 0, n: 0 }]);

    await api().post('/almacen/transferencias').send({ fecha: '2026-10-04', motivo: 'TRANSFERENCIA', id_almacen: 1, id_almacen_destino: 1, lineas: linea(id, '1') }).expect(400);

    await api().post(`/almacen/ingresos/${compra.body.id}/anular`).expect(200);
    e = await estado(id);
    expect(e.stock).toBe(40);
    await api().post(`/almacen/ingresos/${compra.body.id}/anular`).expect(409);

    const kardex = await api().get(`/almacen/kardex?id_producto=${id}`).expect(200);
    expect(kardex.body.total).toBe(6);
    const ultimo = kardex.body.data.at(-1);
    expect(num(ultimo.saldo_total)).toBe(40);
  });

  it('los préstamos reducen el disponible, no el stock total, y los retornos dañados quedan no operativos', async () => {
    const id = await crearProducto({ clase: 'EQUIPO_RETORNABLE', descripcion: 'TALADRO DE PRUEBA' });
    await api().post('/almacen/inventario-inicial').send({ fecha: '2026-10-01', motivo: 'INVENTARIO_INICIAL', id_almacen: 1, lineas: linea(id, '3', '100') }).expect(201);

    const consumible = await crearProducto();
    await api().post('/almacen/prestamos').send({ fecha_prestamo: '2026-10-05', id_almacen: 1, id_responsable: trabajadorId, dias_autorizados: 7, lineas: linea(consumible, '1') }).expect(400);

    const pre = await api().post('/almacen/prestamos').send({ fecha_prestamo: '2026-09-20', id_almacen: 1, id_responsable: trabajadorId, dias_autorizados: 7, lineas: linea(id, '2') }).expect(201);
    expect(pre.body.fecha_prevista_retorno).toBe('2026-09-27');
    expect(pre.body.estado).toBe('ABIERTO');
    expect(pre.body.estado_plazo).toBe('VENCIDO');
    let e = await estado(id);
    expect(e.stock).toBe(3);
    expect(e.almacenes[0]).toEqual({ a: 1, c: 3, p: 2, n: 0 });

    await api().post('/almacen/prestamos').send({ fecha_prestamo: '2026-10-05', id_almacen: 1, id_responsable: trabajadorId, dias_autorizados: 7, lineas: linea(id, '2') }).expect(409);
    await api().post('/almacen/salidas').send({ fecha: '2026-10-06', motivo: 'CONSUMO', id_almacen: 1, lineas: linea(id, '2') }).expect(409);

    const detalleId = pre.body.lineas[0].id;
    await api().post(`/almacen/prestamos/${pre.body.id}/retornos`).send({ fecha_retorno: '2026-10-10', retornos: [{ id_prestamo_detalle: detalleId, cantidad: '3', condicion: 'OPERATIVO' }] }).expect(400);
    const parcial = await api().post(`/almacen/prestamos/${pre.body.id}/retornos`).send({ fecha_retorno: '2026-10-10', retornos: [{ id_prestamo_detalle: detalleId, cantidad: '1', condicion: 'OPERATIVO' }] }).expect(200);
    expect(parcial.body.estado).toBe('PARCIAL');
    const cierre = await api().post(`/almacen/prestamos/${pre.body.id}/retornos`).send({ fecha_retorno: '2026-10-11', retornos: [{ id_prestamo_detalle: detalleId, cantidad: '1', condicion: 'DANADO', observaciones: 'sin mandril' }] }).expect(200);
    expect(cierre.body.estado).toBe('CERRADO');
    expect(cierre.body.estado_plazo).toBe('RETORNADO_CON_RETRASO');
    e = await estado(id);
    expect(e.almacenes[0]).toEqual({ a: 1, c: 3, p: 0, n: 1 });

    const stock = await api().get(`/almacen/stock?q=TALADRO DE PRUEBA`).expect(200);
    const fila = stock.body.data.find((s: { id_producto: number }) => s.id_producto === id);
    expect(num(fila.disponible)).toBe(2);
    expect(fila.alerta).toBe('EQUIPO_NO_OPERATIVO');

    await api().patch(`/almacen/stock/${id}/1/operativo`).send({ cantidad: '1' }).expect(204);
    expect((await estado(id)).almacenes[0]).toEqual({ a: 1, c: 3, p: 0, n: 0 });
    await api().patch(`/almacen/stock/${id}/1/operativo`).send({ cantidad: '1' }).expect(409);

    await api().post(`/almacen/prestamos/${pre.body.id}/anular`).expect(409);
  });

  it('anular un préstamo sin retornos libera lo reservado', async () => {
    const id = await crearProducto({ clase: 'EQUIPO_RETORNABLE' });
    await api().post('/almacen/inventario-inicial').send({ fecha: '2026-10-01', motivo: 'INVENTARIO_INICIAL', id_almacen: 1, lineas: linea(id, '2', '50') }).expect(201);
    const pre = await api().post('/almacen/prestamos').send({ fecha_prestamo: '2099-01-01', id_almacen: 1, id_responsable: trabajadorId, dias_autorizados: 3, lineas: linea(id, '2') }).expect(201);
    expect(pre.body.estado_plazo).toBe('EN_PLAZO');
    await api().post(`/almacen/prestamos/${pre.body.id}/anular`).expect(200);
    expect((await estado(id)).almacenes[0]).toEqual({ a: 1, c: 2, p: 0, n: 0 });
  });

  it('sugiere compra solo para no retornables bajo el mínimo y consulta alternativas', async () => {
    const id = await crearProducto({ min: '10', obj: '20', descripcion: 'SELLADOR PRUEBA ALMACEN' });
    const alt = await crearProducto({ descripcion: 'SELLADOR ALTERNATIVO PRUEBA ALMACEN' });
    await api().post('/almacen/inventario-inicial').send({ fecha: '2026-10-01', motivo: 'INVENTARIO_INICIAL', id_almacen: 1, lineas: [{ id_producto: id, cantidad: '4', costo_unitario: '10' }, { id_producto: alt, cantidad: '8', costo_unitario: '12' }] }).expect(201);

    const sug = await api().get('/almacen/stock/compra-sugerida?q=SELLADOR PRUEBA ALMACEN').expect(200);
    const fila = sug.body.data.find((s: { id_producto: number }) => s.id_producto === id);
    expect(num(fila.compra_sugerida)).toBe(16);
    expect(fila.alerta).toBe('BAJO_MINIMO');

    await api().put(`/maestros/producto/${id}/alternativas`).send({ alternativas: [{ id_producto_alternativo: alt, prioridad: 1 }] }).expect(200);
    const consulta = await api().get(`/almacen/consulta?q=SELLADOR PRUEBA ALMACEN`).expect(200);
    expect(consulta.body.producto.id).toBe(id);
    expect(num(consulta.body.producto.disponible)).toBe(4);
    expect(consulta.body.alternativas).toHaveLength(1);
    expect(num(consulta.body.alternativas[0].disponible)).toBe(8);
    expect(consulta.body.stock_por_almacen).toHaveLength(1);
  });

  it('dos salidas simultáneas nunca dejan el stock negativo', async () => {
    const id = await crearProducto();
    await api().post('/almacen/inventario-inicial').send({ fecha: '2026-10-01', motivo: 'INVENTARIO_INICIAL', id_almacen: 1, lineas: linea(id, '100', '5') }).expect(201);
    const intentos = await Promise.all(
      [1, 2, 3].map(() => api().post('/almacen/salidas').send({ fecha: '2026-10-06', motivo: 'CONSUMO', id_almacen: 1, lineas: linea(id, '40') })),
    );
    const ok = intentos.filter((r) => r.status === 201).length;
    const conflicto = intentos.filter((r) => r.status === 409).length;
    expect(ok).toBe(2);
    expect(conflicto).toBe(1);
    const e = await estado(id);
    expect(e.stock).toBe(20);
    expect(e.almacenes[0].c).toBe(20);
  });

  it('el stock total del producto coincide con la suma de sus almacenes', async () => {
    const r = await db.query(
      `select count(*)::int n from producto p
        where p.id = any($1) and p.stock <> coalesce((select sum(cantidad) from stock_almacen s where s.id_producto = p.id), 0)`,
      [productoIds],
    );
    expect(r.rows[0].n).toBe(0);
  });
});
