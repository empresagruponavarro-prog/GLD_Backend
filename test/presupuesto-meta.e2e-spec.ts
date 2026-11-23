import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { aDia, deDia, lunesDe } from '../src/features/operaciones-obra/shared/control-avance/calendario.js';
import { hoyLima } from '../src/features/operaciones-obra/shared/obra-shared.js';
import { aprobarE2E } from './helpers/aprobacion.js';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E, USUARIO_E2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Plan 11 (Presupuesto Base y Presupuesto Meta), F1, contra la BD de DATABASE_URL: el Meta sigue al Base. Todo lo que se guarda en
 * «Presupuesto Base» (ítems, montos de subfases y fases, plantillas) deja al día el Meta en ítems, subfases, fases y presupuesto, sin
 * tocar el Base; un precio Meta propio se conserva; una nueva versión copia el Meta.
 * Crea su centro de costo (`E2E-PM-*`) y lo elimina al final.
 */
describe('Presupuesto Meta: el Meta sigue al Base (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  let productoA = 0;
  let productoB = 0;
  let productoC = 0;
  let unidad = 0;
  let cliente = 0;
  let proveedor = 0;
  let cc = 0;

  const api = () => apiConSesion(app);

  /** Presupuesto Principal con una fase y las subfases indicadas, creados por la API como lo hace el asistente. */
  const crearPpto = async (codigo: string, subfases: Array<{ cat: string; costoDirecto?: number }>, fase = 'E2E-PM-F1', idCc = cc) => {
    await api()
      .post('/presupuestos')
      .send({ IdPresupuesto: codigo, id_centro_costo: idCc, TipoPpto: 'Principal', Proyecto: 'E2E PM', Estado: 'PENDIENTE' })
      .expect(201);
    const detalleFase = `E2E-PM-DF-${codigo}`;
    await api()
      .post('/presupuestos/fases-asignadas')
      .send({ IdPresupuestoDetalle: detalleFase, IdPresupuesto: codigo, IdpptoFase: fase, id_centro_costo: idCc })
      .expect(201);
    const subs: number[] = [];
    for (const [k, s] of subfases.entries()) {
      const res = await api()
        .post('/presupuestos/categorias-asignadas')
        .send({
          IdPresupuestoDetalleCategoria: `E2E-PM-DC-${codigo}-${k}`,
          IdPresupuesto: codigo,
          IdPresupuestoDetalle: detalleFase,
          IdpptoFaseCategoria: s.cat,
          IdpptoFase: fase,
          id_centro_costo: idCc,
          ...(s.costoDirecto !== undefined ? { CostoDirecto: s.costoDirecto } : {}),
        })
        .expect(201);
      subs.push(res.body.id as number);
    }
    return { subs };
  };

  type ItemEntrada = { id?: number; producto: number; cant: number; pu: number };
  /** `PUT …/items` (el Base): el lote completo de ítems de la subfase. */
  const guardarItems = (idSub: number, items: ItemEntrada[]) =>
    api()
      .put(`/presupuestos/categorias-asignadas/${idSub}/items`)
      .send({
        items: items.map((i) => ({
          ...(i.id ? { id: i.id } : {}),
          id_producto: i.producto,
          id_unidad_medida: unidad,
          Cantidad: i.cant,
          CostoUnitario: i.pu,
          PrecioVenta: 0,
        })),
      });

  /** Base y Meta de cada nivel, tal como están guardados. */
  const leer = async (codigo: string) => {
    const items = (
      await db.query(
        `select i.id, i.id_detalle_categoria as sub, i."CostoUnitario"::float as pu, i."CostoUnitarioMeta"::float as pu_meta,
                i."CostoTotal"::float as total, i."CostoTotalMeta"::float as total_meta
           from "ppto_DetalleItems" i where i."IdPresupuesto" = $1 order by i.id`,
        [codigo],
      )
    ).rows as Array<{ id: number; sub: number; pu: number; pu_meta: number | null; total: number; total_meta: number }>;
    const nivel = async (tabla: string) =>
      (
        await db.query(`select id, "CostoDirecto"::float as base, "CostoDirectoMeta"::float as meta from "${tabla}" where "IdPresupuesto" = $1 order by id`, [codigo])
      ).rows as Array<{ id: number; base: number | null; meta: number | null }>;
    const ppto = (
      await db.query(`select "CostoDirecto"::float as base, "CostoDirectoMeta"::float as meta from "ppto_Principal" where "IdPresupuesto" = $1`, [codigo])
    ).rows[0] as { base: number | null; meta: number | null };
    return { items, subs: await nivel('ppto_DetalleFasesCate'), fases: await nivel('ppto_DetalleFases'), ppto };
  };

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id;
    const categoria = (await db.query(`select id from categoria order by id limit 1`)).rows[0].id as number;
    const crearProducto = async (descripcion: string) =>
      (
        await db.query(`insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, $3, $4, 'PRODUCTO') returning id`, [
          `ZZ-PM-${Math.random().toString(36).slice(2, 8)}`,
          descripcion,
          categoria,
          unidad,
        ])
      ).rows[0].id as number;
    productoA = await crearProducto('PRODUCTO A DE PRUEBA META');
    productoB = await crearProducto('PRODUCTO B DE PRUEBA META');
    productoC = await crearProducto('PRODUCTO C DE PRUEBA META');
    const anexo = async (tipo: string, nombre: string) =>
      (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    cliente = await anexo('Cliente', 'E2E-PM Cliente');
    proveedor = await anexo('Proveedor', 'E2E-PM Proveedor');
    // Quien registra cotizaciones firma con el trabajador vinculado a su usuario (plan 09).
    const trabajador = await anexo('Trabajador', 'E2E-PM Trabajador');
    await db.query(`insert into trabajador (id_anexo) values ($1)`, [trabajador]);
    await db.query(`update usuarios set id_trabajador = $1 where "IdUsuario" = $2`, [trabajador, USUARIO_E2E]);
    cc = (
      await db.query(
        `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ('E2E-PM-OBRA', 'ABIERTO', $1, $2, 2026, $3) returning id`,
        [inicio, fin, cliente],
      )
    ).rows[0].id as number;
    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-PM-F1', 'E2E PM FASE 1'), ('E2E-PM-F2', 'E2E PM FASE 2')`);
    await db.query(
      `insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion")
       values ('E2E-PM-C1', 'E2E-PM-F1', 'E2E PM SUBFASE 1'), ('E2E-PM-C2', 'E2E-PM-F1', 'E2E PM SUBFASE 2'),
              ('E2E-PM-C3', 'E2E-PM-F1', 'E2E PM SUBFASE 3'), ('E2E-PM-C4', 'E2E-PM-F1', 'E2E PM SUBFASE 4'),
              ('E2E-PM-C5', 'E2E-PM-F2', 'E2E PM SUBFASE 5')`,
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      const ccs = `(select id from "CentroCostos" where centro_costo like 'E2E-PM-%')`;
      // Lo que generan las cotizaciones adjudicadas: órdenes, cotizaciones copiadas y FUR.
      await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "documentosOrigen" where id_centro_costo in ${ccs}`);
      await db.query(`update requerimiento set id_cotizacion_ganadora = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from cotizacion where id_requerimiento in (select id from requerimiento where id_centro_costo in ${ccs})`);
      await db.query(`delete from requerimiento where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal_Historial" where "IdPresupuesto" in (select "IdPresupuesto" from "ppto_Principal" where id_centro_costo in ${ccs})`);
      await db.query(`update "ppto_Principal" set id_version_de = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Plantillas_Categorias" where "IdPlantillaFase" like 'E2E-PM-%'`);
      await db.query(`delete from "ppto_Plantillas_Fases" where "IdPlantilla" like 'E2E-PM-%'`);
      await db.query(`delete from "ppto_Plantillas" where "IdPlantilla" like 'E2E-PM-%'`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-PM-%'`);
      await db.query(`delete from "ppto_FasesCategorias" where "IdpptoFaseCategoria" like 'E2E-PM-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-PM-%'`);
      await borrarUsuarioE2E(db);
      await db.query(`delete from trabajador where id_anexo in (select id from anexos where "Anexo" like 'E2E-PM %')`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-PM %'`);
      await db.query(`delete from producto where id = any($1)`, [[productoA, productoB, productoC].filter(Boolean)]);
      await db.end();
    }
    await app?.close();
  });

  // ─── Un presupuesto armado en el Base: el Meta lo sigue en cada paso ────────────────────────────
  describe('lo que se guarda en el Base deja al día el Meta', () => {
    const P1 = 'E2E-PM-P1';
    let s: number[] = [];
    let item1 = 0;
    let item2 = 0;
    let item3 = 0;

    beforeAll(async () => {
      // S1 y S2 llevarán ítems; S3 y S4 son subfases sin ítems con un monto escrito a mano (como las del asistente).
      s = (await crearPpto(P1, [{ cat: 'E2E-PM-C1' }, { cat: 'E2E-PM-C2' }, { cat: 'E2E-PM-C3', costoDirecto: 1000 }, { cat: 'E2E-PM-C4', costoDirecto: 500 }])).subs;
    });

    it('con ítems solo en el Base, el Meta es igual al Base en ítems, subfases, fase y presupuesto', async () => {
      const r1 = await guardarItems(s[0], [
        { producto: productoA, cant: 10, pu: 100 }, // 1 000
        { producto: productoB, cant: 2.5, pu: 40 }, // 100
      ]).expect(200);
      item1 = r1.body.items[0].id;
      item2 = r1.body.items[1].id;
      const r2 = await guardarItems(s[1], [{ producto: productoA, cant: 4, pu: 25 }]).expect(200); // 100
      item3 = r2.body.items[0].id;

      const d = await leer(P1);
      expect(d.items.map((i) => [i.total, i.total_meta, i.pu_meta])).toEqual([
        [1000, 1000, null],
        [100, 100, null],
        [100, 100, null],
      ]);
      expect(d.subs.map((x) => [x.base, x.meta])).toEqual([
        [1100, 1100],
        [100, 100],
        [1000, null], // sin ítems: sin monto Meta propio, vale su Base
        [500, null],
      ]);
      expect(d.fases.map((f) => [f.base, f.meta])).toEqual([[2700, 2700]]);
      expect(d.ppto.meta).toBe(2700);
    });

    it('la respuesta de los ítems trae el Meta de cada ítem y el total Meta de la subfase', async () => {
      const res = await api().get(`/presupuestos/categorias-asignadas/${s[0]}/items`).expect(200);
      expect(res.body.costoTotalMeta).toBe(1100);
      expect(res.body.items[0]).toMatchObject({ CostoUnitario: 100, CostoUnitarioMeta: null, CostoUnitarioMetaEfectivo: 100, CostoTotal: 1000, CostoTotalMeta: 1000 });
    });

    it('un ítem con precio Meta propio usa su precio; el Base no cambia', async () => {
      await db.query(`update "ppto_DetalleItems" set "CostoUnitarioMeta" = 150 where id = $1`, [item1]);
      // Guardar el Base de la subfase (sin cambios) rearma el Meta.
      await guardarItems(s[0], [
        { id: item1, producto: productoA, cant: 10, pu: 100 },
        { id: item2, producto: productoB, cant: 2.5, pu: 40 },
      ]).expect(200);

      const d = await leer(P1);
      expect(d.items[0]).toMatchObject({ pu: 100, total: 1000, pu_meta: 150, total_meta: 1500 });
      expect(d.subs.map((x) => [x.base, x.meta])).toEqual([
        [1100, 1600], // 1 500 + 100
        [100, 100],
        [1000, null],
        [500, null],
      ]);
      expect(d.fases[0]).toMatchObject({ base: 2700, meta: 3200 }); // 1 600 + 100 + 1 000 + 500
      expect(d.ppto.meta).toBe(3200);
    });

    it('cambiar la cantidad de un ítem con Meta propio mueve su total Meta; el Base va con su precio Base', async () => {
      await guardarItems(s[0], [
        { id: item1, producto: productoA, cant: 20, pu: 100 },
        { id: item2, producto: productoB, cant: 2.5, pu: 40 },
      ]).expect(200);

      const d = await leer(P1);
      expect(d.items[0]).toMatchObject({ total: 2000, total_meta: 3000 }); // 20 × 100 y 20 × 150
      expect(d.subs[0]).toMatchObject({ base: 2100, meta: 3100 });
    });

    it('cambiar el precio Base de un ítem sin Meta propio mueve también su Meta', async () => {
      await guardarItems(s[0], [
        { id: item1, producto: productoA, cant: 20, pu: 100 },
        { id: item2, producto: productoB, cant: 2.5, pu: 60 }, // 40 → 60
      ]).expect(200);

      const d = await leer(P1);
      expect(d.items[1]).toMatchObject({ pu: 60, total: 150, pu_meta: null, total_meta: 150 });
      expect(d.subs[0]).toMatchObject({ base: 2150, meta: 3150 });
    });

    it('una subfase sin ítems conserva su monto Meta escrito a mano al guardar ítems de otra subfase', async () => {
      await db.query(`update "ppto_DetalleFasesCate" set "CostoDirectoMeta" = 900 where id = $1`, [s[2]]);
      await guardarItems(s[1], [{ id: item3, producto: productoA, cant: 4, pu: 25 }]).expect(200);

      const d = await leer(P1);
      expect(d.subs[2]).toMatchObject({ base: 1000, meta: 900 });
      // 3 150 + 100 + 900 + 500
      expect(d.fases[0]).toMatchObject({ meta: 4650 });
      expect(d.ppto.meta).toBe(4650);
    });

    it('el monto Base de una subfase sin ítems (sin Meta propio) mueve el Meta de la fase y del presupuesto', async () => {
      await api().patch(`/presupuestos/categorias-asignadas/${s[3]}`).send({ CostoDirecto: 700 }).expect(200);

      const d = await leer(P1);
      expect(d.subs[3]).toMatchObject({ base: 700, meta: null });
      expect(d.fases[0].meta).toBe(4850); // 3 150 + 100 + 900 + 700
      expect(d.ppto.meta).toBe(4850);
    });

    it('quitar todos los ítems de una subfase que los tenía devuelve su Meta al Base', async () => {
      await guardarItems(s[1], []).expect(200);

      const d = await leer(P1);
      expect(d.subs[1]).toMatchObject({ base: 0, meta: null });
      expect(d.fases[0].meta).toBe(4750); // 3 150 + 0 + 900 + 700
    });

    it('eliminar una subfase la saca del Meta de la fase y del presupuesto', async () => {
      await api().delete(`/presupuestos/categorias-asignadas/${s[3]}`).expect(200);

      const d = await leer(P1);
      expect(d.fases[0].meta).toBe(4050); // 3 150 + 0 + 900
      expect(d.ppto.meta).toBe(4050);
    });

    it('el Meta efectivo de la fase también llega en el presupuesto completo', async () => {
      const res = await api().get(`/presupuestos/${P1}/completo`).expect(200);
      expect(Number(res.body.fases[0].CostoDirectoMeta)).toBe(4050); // Meta: 3 150 + 0 + 900
      expect(Number(res.body.fases[0].CostoDirecto)).toBe(3150); // Base: 2 150 + 0 + 1 000
    });

    it('guardar sin ítems una subfase que ya estaba sin ítems no le borra el monto Meta escrito a mano', async () => {
      await guardarItems(s[2], []).expect(200);

      const d = await leer(P1);
      expect(d.subs[2].meta).toBe(900);
    });
  });

  // ─── Una nueva versión copia el Meta ──────────────────────────────────────────────────────────
  describe('nueva versión', () => {
    it('copia el precio Meta propio de los ítems y el Meta de subfases, fases y presupuesto', async () => {
      const origen = await leer('E2E-PM-P1');
      const res = await api().post('/presupuestos/E2E-PM-P1/nueva-version').expect(201);
      const copia = await leer(res.body.id_presupuesto as string);

      expect(copia.items.map((i) => [i.pu, i.pu_meta, i.total, i.total_meta])).toEqual(origen.items.map((i) => [i.pu, i.pu_meta, i.total, i.total_meta]));
      expect(copia.subs.map((x) => [x.base, x.meta])).toEqual(origen.subs.map((x) => [x.base, x.meta]));
      expect(copia.fases.map((f) => [f.base, f.meta])).toEqual(origen.fases.map((f) => [f.base, f.meta]));
      expect(copia.ppto.meta).toBe(origen.ppto.meta);
      expect(copia.items[0].pu_meta).toBe(150); // el precio Meta propio viajó
    });
  });

  // ─── Aplicar una plantilla ────────────────────────────────────────────────────────────────────
  describe('aplicar una plantilla', () => {
    it('los ítems copiados nacen con Meta = Base y el Meta se arma en subfase, fase y presupuesto', async () => {
      await db.query(`insert into "ppto_Plantillas" ("IdPlantilla", "Nombre") values ('E2E-PM-PL', 'E2E PM PLANTILLA')`);
      await db.query(`insert into "ppto_Plantillas_Fases" ("IdPlantillaFase", "IdPlantilla", "IdpptoFase", "Orden") values ('E2E-PM-PLF', 'E2E-PM-PL', 'E2E-PM-F2', 0)`);
      const cat = (
        await db.query(
          `insert into "ppto_Plantillas_Categorias" ("IdPlantillaFase", "IdpptoFaseCategoria", "CostoReferencial") values ('E2E-PM-PLF', 'E2E-PM-C5', 400) returning id`,
        )
      ).rows[0].id as number;
      await db.query(
        `insert into "ppto_Plantillas_Items" (id_plantilla_categoria, id_producto, id_unidad_medida, "Item", "Cantidad", "CostoUnitario", "PrecioVenta", "CostoTotal", "VentaTotal", "Orden")
         values ($1, $2, $3, '1.01', 3, 100, 0, 300, 0, 0), ($1, $4, $3, '1.02', 2, 50, 0, 100, 0, 1)`,
        [cat, productoA, unidad, productoB],
      );
      const cc2 = (
        await db.query(
          `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ('E2E-PM-OBRA-2', 'ABIERTO', $1, $2, 2026, $3) returning id`,
          [inicio, fin, cliente],
        )
      ).rows[0].id as number;
      await api()
        .post('/presupuestos')
        .send({ IdPresupuesto: 'E2E-PM-P2', id_centro_costo: cc2, TipoPpto: 'Principal', Proyecto: 'E2E PM', Estado: 'PENDIENTE' })
        .expect(201);

      await api().post('/presupuestos/E2E-PM-P2/aplicar-plantilla').send({ IdPlantilla: 'E2E-PM-PL' }).expect(201);

      const d = await leer('E2E-PM-P2');
      expect(d.items.map((i) => [i.total, i.total_meta, i.pu_meta])).toEqual([
        [300, 300, null],
        [100, 100, null],
      ]);
      expect(d.subs.map((x) => x.meta)).toEqual([400]);
      expect(d.fases.map((f) => f.meta)).toEqual([400]);
      expect(d.ppto.meta).toBe(400);
    });
  });

  // ─── F2: el paso Meta (precios por ítem, % por subfase, monto a mano) ──────────────────────────
  describe('endpoints del Presupuesto Meta', () => {
    const P3 = 'E2E-PM-P3';
    let idPpto = 0;
    let s: number[] = [];
    let iA = 0;
    let iB = 0;

    const itemsMeta = (idSub: number, items: Array<{ id: number; meta: number | null }>) =>
      api()
        .put(`/presupuestos/categorias-asignadas/${idSub}/items-meta`)
        .send({ items: items.map((i) => ({ id: i.id, CostoUnitarioMeta: i.meta })) });
    const ajuste = (idSub: number, porcentaje: number) => api().post(`/presupuestos/categorias-asignadas/${idSub}/meta/ajuste`).send({ porcentaje });
    const fijarMeta = (idSub: number, monto: number | null) => api().put(`/presupuestos/categorias-asignadas/${idSub}/meta`).send({ CostoDirectoMeta: monto });
    const arbol = async () => (await api().get(`/presupuestos/${P3}/meta`).expect(200)).body;
    const puMeta = (body: { items: Array<{ id: number; CostoUnitarioMeta: number | null }> }, id: number) => body.items.find((i) => i.id === id)?.CostoUnitarioMeta;

    beforeAll(async () => {
      // S1 lleva dos ítems (1 000 + 200); S2 es una subfase sin ítems con un monto Base a mano.
      s = (await crearPpto(P3, [{ cat: 'E2E-PM-C1' }, { cat: 'E2E-PM-C2', costoDirecto: 500 }])).subs;
      const r = await guardarItems(s[0], [
        { producto: productoA, cant: 10, pu: 100 },
        { producto: productoB, cant: 5, pu: 40 },
      ]).expect(200);
      iA = r.body.items[0].id;
      iB = r.body.items[1].id;
      idPpto = (await db.query(`select id from "ppto_Principal" where "IdPresupuesto" = $1`, [P3])).rows[0].id as number;
    });

    it('GET meta: Base vs Meta de cada fase, subfase e ítem (sin Meta propio, iguales)', async () => {
      const body = await arbol();
      expect(body).toMatchObject({ id_presupuesto: P3, estado_ppto: 'EN_DESARROLLO', editable: true });
      expect(body.totales).toEqual({ base: '1700.00', meta: '1700.00', diferencia: '0.00', diferencia_pct: '0.00' });
      expect(body.fases).toHaveLength(1);
      const [s1, s2] = body.fases[0].subfases;
      expect(s1).toMatchObject({ id: s[0], base: '1200.00', meta: '1200.00', meta_manual: false, cotizaciones: 0 });
      expect(s1.items[0]).toMatchObject({ id: iA, cantidad: '10.00', pu_base: '100.00', pu_meta: '100.00', pu_meta_propio: false, total_base: '1000.00', total_meta: '1000.00' });
      expect(s2).toMatchObject({ id: s[1], base: '500.00', meta: '500.00', meta_manual: false, items: [] });
    });

    it('GET meta acepta el id numérico y responde 404 si el presupuesto no existe', async () => {
      await api().get(`/presupuestos/${idPpto}/meta`).expect(200);
      await api().get('/presupuestos/E2E-PM-NO-EXISTE/meta').expect(404);
    });

    it('PUT items-meta fija el precio Meta de un ítem; el otro y el Base no cambian', async () => {
      const res = await itemsMeta(s[0], [{ id: iA, meta: 150 }]).expect(200);
      expect(res.body.items[0]).toMatchObject({ id: iA, CostoUnitario: 100, CostoUnitarioMeta: 150, CostoUnitarioMetaEfectivo: 150, CostoTotal: 1000, CostoTotalMeta: 1500 });
      expect(res.body.items[1]).toMatchObject({ id: iB, CostoUnitarioMeta: null, CostoUnitarioMetaEfectivo: 40, CostoTotalMeta: 200 });
      expect(res.body.costoTotalMeta).toBe(1700);
      expect(res.body.reprorrateo).toEqual({ actualizadas: 0, omitidas: [] });

      const body = await arbol();
      expect(body.totales).toEqual({ base: '1700.00', meta: '2200.00', diferencia: '500.00', diferencia_pct: '29.41' });
      expect(body.fases[0].subfases[0]).toMatchObject({ base: '1200.00', meta: '1700.00' });
      expect(body.fases[0].subfases[0].items[0]).toMatchObject({ pu_meta: '150.00', pu_meta_propio: true, total_meta: '1500.00' });
    });

    it('PUT items-meta con null devuelve el ítem al Base', async () => {
      const res = await itemsMeta(s[0], [{ id: iA, meta: null }]).expect(200);
      expect(puMeta(res.body, iA)).toBeNull();
      expect(res.body.costoTotalMeta).toBe(1200);
    });

    it('PUT items-meta valida: precio menor a un céntimo, lista vacía, ítems repetidos y ajenos', async () => {
      await itemsMeta(s[0], [{ id: iA, meta: 0 }]).expect(400);
      await itemsMeta(s[0], [{ id: iA, meta: -5 }]).expect(400);
      await api().put(`/presupuestos/categorias-asignadas/${s[0]}/items-meta`).send({ items: [] }).expect(400);
      await itemsMeta(s[0], [{ id: iA, meta: 110 }, { id: iA, meta: 120 }]).expect(400);
      const ajeno = await itemsMeta(s[0], [{ id: 2147483000, meta: 50 }]).expect(400);
      expect(JSON.stringify(ajeno.body)).toContain('no pertenecen');
      await itemsMeta(987654321, [{ id: iA, meta: 50 }]).expect(404);
    });

    it('POST ajuste aplica un % al Base de todos los ítems: +50 % y luego -10 %', async () => {
      const sube = await ajuste(s[0], 50).expect(200);
      expect([puMeta(sube.body, iA), puMeta(sube.body, iB)]).toEqual([150, 60]); // 100 × 1,5 y 40 × 1,5
      expect(sube.body.costoTotalMeta).toBe(1800); // 1 500 + 300

      const baja = await ajuste(s[0], -10).expect(200);
      expect([puMeta(baja.body, iA), puMeta(baja.body, iB)]).toEqual([90, 36]); // el % es sobre el Base, no sobre el Meta anterior
      expect(baja.body.costoTotalMeta).toBe(1080);
    });

    it('POST ajuste rechaza un % fuera de rango y una subfase sin ítems', async () => {
      await ajuste(s[0], -100).expect(400);
      await ajuste(s[0], 1001).expect(400);
      await ajuste(s[1], 10).expect(400); // la subfase 2 no tiene ítems
    });

    it('PUT meta fija el monto de una subfase sin ítems; con ítems responde 409; null lo devuelve al Base', async () => {
      const fija = await fijarMeta(s[1], 450).expect(200);
      expect(fija.body).toMatchObject({ id: s[1], base: '500.00', meta: '450.00', meta_manual: true, items: [] });
      expect((await arbol()).fases[0]).toMatchObject({ meta: '1530.00' }); // 1 080 + 450

      await fijarMeta(s[0], 900).expect(409);

      const vuelve = await fijarMeta(s[1], null).expect(200);
      expect(vuelve.body).toMatchObject({ meta: '500.00', meta_manual: false });
    });

    // ── Re-reparto de las cotizaciones al cambiar lo que las sostiene ──
    describe('cotizaciones de la subfase', () => {
      let iC = 0;

      const cotizar = (total: string) =>
        api()
          .post(`/presupuestos/${idPpto}/cotizaciones`)
          .send({ id_detalle_categoria: s[0], id_proveedor: proveedor, total, fecha: hoy, moneda_id: 'PEN', moneda_simbolo: 'S/', forma_pago: 'Contado', adjudicar: true });
      /** Lo que le toca a cada ítem en la cotización (importe de la línea), por ítem. */
      const reparto = async () =>
        Object.fromEntries(
          (
            await db.query(
              `select d.id_ppto_item as item, round(d.cantidad * d.precio_unitario, 2)::float as monto, d.cantidad::float as cant
                 from ppto_cotizacion_detalle d join ppto_cotizacion c on c.id = d.id_cotizacion where c.id_detalle_categoria = $1`,
              [s[0]],
            )
          ).rows.map((r: { item: number; monto: number; cant: number }) => [r.item, { monto: r.monto, cant: r.cant }]),
        ) as Record<number, { monto: number; cant: number }>;
      const ganadoras = async () =>
        Object.fromEntries(
          (await db.query(`select id, id_ppto_cot_detalle_ganadora as g from "ppto_DetalleItems" where id_detalle_categoria = $1`, [s[0]])).rows.map((r: { id: number; g: number | null }) => [r.id, r.g]),
        ) as Record<number, number | null>;

      it('una cotización nueva se reparte con los pesos Meta de los ítems', async () => {
        // Meta: A 10 × 150 = 1 500 y B 5 × 40 = 200 → de 1 200: 1 058,82 y 141,18.
        await itemsMeta(s[0], [{ id: iA, meta: 150 }, { id: iB, meta: null }]).expect(200);
        await cotizar('1200').expect(201);

        const r = await reparto();
        expect([r[iA].monto, r[iB].monto]).toEqual([1058.82, 141.18]);
        const g = await ganadoras();
        expect(g[iA]).not.toBeNull();
        expect(g[iB]).not.toBeNull();
      });

      it('al cambiar el precio Meta, la cotización se vuelve a repartir: el total y el ganador no cambian', async () => {
        const antes = await ganadoras();
        const res = await itemsMeta(s[0], [{ id: iA, meta: 100 }]).expect(200); // A 1 000 y B 200 → de 1 200: 1 000 y 200
        expect(res.body.reprorrateo).toEqual({ actualizadas: 1, omitidas: [] });

        const r = await reparto();
        expect([r[iA].monto, r[iB].monto]).toEqual([1000, 200]);
        expect(await ganadoras()).toEqual(antes);
      });

      it('volver a guardar el mismo Meta no reescribe nada', async () => {
        const res = await itemsMeta(s[0], [{ id: iA, meta: 100 }]).expect(200);
        expect(res.body.reprorrateo).toEqual({ actualizadas: 0, omitidas: [] });
      });

      it('cambiar el precio Base de un ítem sin Meta propio mueve su Meta y vuelve a repartir; con Meta propio, no', async () => {
        // iB no tiene Meta propio: su Meta es su Base. 40 → 60 cambia los pesos (A 1 000 y B 300 → de 1 200: 923,08 y 276,92).
        const sube = await guardarItems(s[0], [
          { id: iA, producto: productoA, cant: 10, pu: 100 },
          { id: iB, producto: productoB, cant: 5, pu: 60 },
        ]).expect(200);
        expect(sube.body.reprorrateo).toMatchObject({ actualizadas: 1, omitidas: [] });
        const r = await reparto();
        expect([r[iA].monto, r[iB].monto]).toEqual([923.08, 276.92]);

        // Vuelve a 40: los pesos regresan a 1 000 y 200.
        await guardarItems(s[0], [
          { id: iA, producto: productoA, cant: 10, pu: 100 },
          { id: iB, producto: productoB, cant: 5, pu: 40 },
        ]).expect(200);
        const vuelve = await reparto();
        expect([vuelve[iA].monto, vuelve[iB].monto]).toEqual([1000, 200]);

        // iA sí tiene Meta propio (100): subir su Base a 110 no mueve su Meta, así que la cotización no se toca.
        const base = await guardarItems(s[0], [
          { id: iA, producto: productoA, cant: 10, pu: 110 },
          { id: iB, producto: productoB, cant: 5, pu: 40 },
        ]).expect(200);
        expect(base.body.reprorrateo).toBeUndefined();
        await guardarItems(s[0], [
          { id: iA, producto: productoA, cant: 10, pu: 100 },
          { id: iB, producto: productoB, cant: 5, pu: 40 },
        ]).expect(200);
      });

      it('cambiar la cantidad en el Base no reparte: la línea conserva su cantidad y el FUR toma la nueva (como antes)', async () => {
        const res = await guardarItems(s[0], [
          { id: iA, producto: productoA, cant: 20, pu: 100 }, // Meta propio 100 → 2 000
          { id: iB, producto: productoB, cant: 5, pu: 40 },
        ]).expect(200);
        expect(res.body.reprorrateo).toBeUndefined();

        const r = await reparto();
        expect(r[iA]).toEqual({ monto: 1000, cant: 10 }); // la cotización sigue con lo que se cotizó
        expect((await ganadoras())[iA]).not.toBeNull(); // y el ganador se conserva
      });

      it('la siguiente grabación del Meta incorpora la cantidad nueva y los ítems que se agregaron, y pasan al proveedor que ya gana la subfase', async () => {
        const nuevo = await guardarItems(s[0], [
          { id: iA, producto: productoA, cant: 20, pu: 100 },
          { id: iB, producto: productoB, cant: 5, pu: 40 },
          { producto: productoB, cant: 2, pu: 50 }, // ítem nuevo: 100
        ]).expect(200);
        iC = nuevo.body.items[2].id;
        expect(nuevo.body.reprorrateo).toBeUndefined(); // agregar un ítem en el Base tampoco reparte
        expect(Object.keys(await reparto())).toHaveLength(2);
        expect((await ganadoras())[iC]).toBeNull();

        // Al grabar el Meta se reparte con lo de hoy: A 2 000 (20 × 100), B 200 y C 100 → de 1 200: 1 043,48, 104,35 y 52,17.
        const res = await itemsMeta(s[0], [{ id: iA, meta: 100 }]).expect(200);
        expect(res.body.reprorrateo).toMatchObject({ actualizadas: 1 });
        const r = await reparto();
        expect(r[iA].cant).toBe(20);
        expect(Object.keys(r)).toHaveLength(3);
        expect([r[iA].monto, r[iB].monto, r[iC].monto]).toEqual([1043.48, 104.35, 52.17]);
        expect(Math.round((r[iA].monto + r[iB].monto + r[iC].monto) * 100) / 100).toBe(1200); // el total del proveedor no cambia
        expect((await ganadoras())[iC]).not.toBeNull();
      });

      it('un ítem al que se le cambió el producto pierde su ganador y el reparto no se lo devuelve', async () => {
        const res = await guardarItems(s[0], [
          { id: iA, producto: productoA, cant: 20, pu: 100 },
          { id: iB, producto: productoC, cant: 6, pu: 40 }, // otro producto y otra cantidad
          { id: iC, producto: productoB, cant: 2, pu: 50 },
        ]).expect(200);
        expect(res.body.reprorrateo).toBeUndefined();
        expect((await ganadoras())[iB]).toBeNull(); // la cotización era de otro producto: se vuelve a elegir

        // El reparto de la siguiente grabación del Meta sí toma su cantidad, pero no readjudica ese ítem.
        const meta = await itemsMeta(s[0], [{ id: iA, meta: 100 }]).expect(200);
        expect(meta.body.reprorrateo).toMatchObject({ actualizadas: 1 });
        const g = await ganadoras();
        expect(g[iB]).toBeNull();
        expect(g[iA]).not.toBeNull();
        expect(g[iC]).not.toBeNull();
        expect((await reparto())[iB].cant).toBe(6);
      });

      it('una cotización con una orden registrada no se toca: se informa como omitida', async () => {
        await db.query(
          `update "documentosOrigen" set estado = 'REGISTRADO'
            where id_requerimiento in (select id from requerimiento where id_ppto_principal = $1 and origen = 'PPTO_ADJUDICACION')`,
          [idPpto],
        );
        const antes = await reparto();

        const res = await itemsMeta(s[0], [{ id: iA, meta: 120 }]).expect(200);
        expect(res.body.reprorrateo.actualizadas).toBe(0);
        expect(res.body.reprorrateo.omitidas).toEqual([expect.objectContaining({ motivo: 'ORDEN_REGISTRADA' })]);
        expect(puMeta(res.body, iA)).toBe(120); // el Meta sí se guardó
        expect(await reparto()).toEqual(antes); // pero la cotización quedó como estaba
      });
    });
  });

  describe('presupuesto fuera de desarrollo, revisión u observado', () => {
    const P4 = 'E2E-PM-P4';
    let sub = 0;
    let item = 0;

    beforeAll(async () => {
      sub = (await crearPpto(P4, [{ cat: 'E2E-PM-C1' }])).subs[0];
      item = (await guardarItems(sub, [{ producto: productoA, cant: 1, pu: 100 }]).expect(200)).body.items[0].id;
    });

    it('en revisión o observado el Meta se edita', async () => {
      for (const estado of ['EN_REVISION', 'OBSERVADO']) {
        await db.query(`update "ppto_Principal" set estado_ppto = $2 where "IdPresupuesto" = $1`, [P4, estado]);
        await api().put(`/presupuestos/categorias-asignadas/${sub}/items-meta`).send({ items: [{ id: item, CostoUnitarioMeta: 90 }] }).expect(200);
      }
    });

    it('con el presupuesto ya aprobado, entregado, liquidado o anulado el Meta responde 409 y la lectura dice que no es editable', async () => {
      for (const estado of ['APROBADO', 'ENTREGADO', 'LIQUIDADO', 'ANULADO']) {
        await db.query(`update "ppto_Principal" set estado_ppto = $2 where "IdPresupuesto" = $1`, [P4, estado]);
        await api().put(`/presupuestos/categorias-asignadas/${sub}/items-meta`).send({ items: [{ id: item, CostoUnitarioMeta: 80 }] }).expect(409);
        await api().post(`/presupuestos/categorias-asignadas/${sub}/meta/ajuste`).send({ porcentaje: 10 }).expect(409);
        const lectura = await api().get(`/presupuestos/${P4}/meta`).expect(200);
        expect(lectura.body).toMatchObject({ estado_ppto: estado, editable: false });
      }
      // Nada se escribió: el último precio Meta guardado sigue siendo el de cuando sí se podía.
      expect((await leer(P4)).items[0].pu_meta).toBe(90);
    });
  });

  // ─── F3: lo que viene después del Meta (Comercial, FUR y obra) lo toma como referencia ──────────
  describe('Comercial, FUR y obra toman el Meta; la liquidación y el centro de costo siguen en el Base', () => {
    const P5 = 'E2E-PM-P5';
    const P6 = 'E2E-PM-P6';
    let cc5 = 0;
    let idPpto5 = 0;
    let sub5 = 0;

    /** Un presupuesto de un ítem: 10 × S/ 100 en el Base y S/ 150 en el Meta (1 000 vs 1 500), en su propio centro de costo. */
    const armar = async (codigo: string, nombreCc: string) => {
      const idCc = (
        await db.query(
          `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ($1, 'ABIERTO', $2, $3, 2026, $4) returning id`,
          [nombreCc, inicio, fin, cliente],
        )
      ).rows[0].id as number;
      const sub = (await crearPpto(codigo, [{ cat: 'E2E-PM-C1' }], 'E2E-PM-F1', idCc)).subs[0];
      const item = (await guardarItems(sub, [{ producto: productoA, cant: 10, pu: 100 }]).expect(200)).body.items[0].id as number;
      await api().put(`/presupuestos/categorias-asignadas/${sub}/items-meta`).send({ items: [{ id: item, CostoUnitarioMeta: 150 }] }).expect(200);
      const idPpto = (await db.query(`select id from "ppto_Principal" where "IdPresupuesto" = $1`, [codigo])).rows[0].id as number;
      return { idCc, sub, item, idPpto };
    };
    const comercial = async () => (await api().get(`/presupuestos/${P5}/comercial`).expect(200)).body;

    beforeAll(async () => {
      const p = await armar(P5, 'E2E-PM-OBRA-3');
      cc5 = p.idCc;
      sub5 = p.sub;
      idPpto5 = p.idPpto;
    });

    it('el Comercial parte del Meta, no del Base', async () => {
      const c = await comercial();
      expect(c.total).toEqual({ meta: 1500, comercial: 1500, diferencia: 0 });
      expect(c.fases[0]).toMatchObject({ meta: 1500, comercial: 1500, fuente: 'META' });
    });

    it('con un proveedor, el Comercial muestra la diferencia contra el Meta (no contra el Base)', async () => {
      await api()
        .post(`/presupuestos/${idPpto5}/cotizaciones`)
        .send({ id_detalle_categoria: sub5, id_proveedor: proveedor, total: '1350', fecha: hoy, moneda_id: 'PEN', moneda_simbolo: 'S/', forma_pago: 'Contado', adjudicar: true })
        .expect(201);

      const c = await comercial();
      expect(c.fases[0]).toMatchObject({ meta: 1500, comercial: 1350, fuente: 'ADJUDICACION' });
      expect(c.fases[0].items[0]).toMatchObject({ meta: 1500, comercial: 1350, diferencia: -150, diferencia_pct: -10 });
    });

    it('el FUR de la adjudicación lleva el precio Meta como precio referencial', async () => {
      const lineas = (
        await db.query(
          `select rd.precio_referencial::float as precio from requerimiento_detalle rd join requerimiento r on r.id = rd.id_requerimiento
            where r.id_ppto_principal = $1 and r.origen = 'PPTO_ADJUDICACION'`,
          [idPpto5],
        )
      ).rows;
      expect(lineas.map((l: { precio: number }) => l.precio)).toEqual([150]);
    });

    it('al aprobar, la obra toma el Meta de cada subfase y todo lo demás sigue sobre el Base', async () => {
      const res = await api().post(`/presupuestos/${P5}/aprobar`).expect(200);
      expect(res.body.estructura).toMatchObject({ capturada: true, partidas: 1, subpartidas: 1 });

      // La obra: el monto de la subpartida (su peso en el avance y su meta de gasto) es el Meta.
      const monto = (await db.query(`select monto::float as monto from obra_subpartida where id_ppto_detalle_categoria = $1`, [sub5])).rows;
      expect(monto).toEqual([{ monto: 1500 }]);
      const gasto = (await api().get(`/operaciones/obra/${cc5}/gasto`).expect(200)).body;
      expect(gasto.total.meta).toBe(1500);

      // La Liquidación Financiera y el centro de costo siguen sobre el Base (D-3).
      const ppto = (
        await db.query(
          `select "CostoDirecto"::float as base, "CostoDirectoMeta"::float as meta, "SubTotalSinIGV"::float as subtotal, "Total"::float as total from "ppto_Principal" where "IdPresupuesto" = $1`,
          [P5],
        )
      ).rows[0];
      expect(ppto).toEqual({ base: 1000, meta: 1500, subtotal: 1000, total: 1180 });
      const monto_cc = (await db.query(`select presupuesto_monto::float as monto from "CentroCostos" where id = $1`, [cc5])).rows[0];
      expect(monto_cc.monto).toBe(1000);
    });

    it('«Generar FURs» (presupuestos aprobados sin adjudicar) también parte del precio Meta', async () => {
      await armar(P6, 'E2E-PM-OBRA-4');
      await aprobarE2E(api(), db, P6); // aprobado y sin adjudicar, como los presupuestos anteriores al plan 09

      const vista = (await api().get(`/presupuestos/${P6}/furs-preview`).expect(200)).body;
      expect(vista.fases).toHaveLength(1);
      expect(vista.fases[0].items[0]).toMatchObject({ cantidad: '10.00', precio_referencial: '150.00' });
      expect(vista.fases[0].total_estimado).toBe(1500);
    });
  });
});
