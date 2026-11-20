import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { aDia, deDia, lunesDe } from '../src/features/operaciones-obra/shared/control-avance/calendario.js';
import { hoyLima } from '../src/features/operaciones-obra/shared/obra-shared.js';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E, USUARIO_E2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Plan 09, F4, contra la BD de DATABASE_URL: el presupuesto Comercial por ítem (con la diferencia respecto del Meta) y el tope de pago de
 * la orden de servicio según el avance de obra. Crea sus centros de costo (`E2E-TP-*`) y los elimina al final.
 */
describe('Presupuesto Meta: Comercial por ítem y tope de pago por avance (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  let cc = 0;
  let producto = 0;
  let servicio = 0;
  let unidad = 0;
  let provA = 0;
  let trabajadorId = 0;
  let idPpto = 0;
  let idFase = 0;
  let item1 = 0; // servicio 4 × 250 = 1000 (subfase 1)
  let item2 = 0; // servicio 2 × 500 = 1000 (subfase 2)
  let item3 = 0; // producto 1 × 100 (subfase 1)
  let idOs = 0;
  let idOc = 0;
  let netoOs = 0;

  const api = () => apiConSesion(app);
  const num = (v: string | number) => Number(v);
  const redondear2 = (n: number) => Math.round(n * 100) / 100;
  const obra = () => `/operaciones/obra/${cc}`;
  const comercial = async () => (await api().get(`/presupuestos/${idPpto}/comercial`).expect(200)).body;
  const pendiente = async (id: number) => {
    const r = (await api().get('/tesoreria/programacion/pendientes?pageSize=100').expect(200)).body;
    return r.data.find((d: { id: number }) => d.id === id);
  };
  const programar = (id: number, monto: number, extra: Record<string, unknown> = {}) =>
    api()
      .post('/tesoreria/programacion')
      .send({ items: [{ id_documento_origen: id, fecha_programada: '2026-12-04', monto: monto.toFixed(2), medio_pago: 'TRANSFERENCIA', urgente: true, observaciones: 'PRUEBA E2E', ...extra }] });
  const avance = async (semana: number, porSubfase: Array<[number, number]>) => {
    const subs = (await db.query(`select id, id_ppto_detalle_categoria as sub from obra_subpartida where id_centro_costo = $1`, [cc])).rows as Array<{ id: number; sub: number }>;
    await api()
      .put(`${obra()}/avance/semanas/${semana}`)
      .send({ lineas: porSubfase.map(([sub, a]) => ({ idSubpartida: subs.find((s) => s.sub === sub)!.id, avance: a })) })
      .expect(200);
  };

  let sub1 = 0;
  let sub2 = 0;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id;
    const categoria = (await db.query(`select id from categoria order by id limit 1`)).rows[0].id as number;
    const crearProducto = async (tipo: string) =>
      (
        await db.query(`insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, $3, $4, $5) returning id`, [
          `ZZ-TP-${Math.random().toString(36).slice(2, 8)}`,
          `${tipo} DE PRUEBA TOPE`,
          categoria,
          unidad,
          tipo,
        ])
      ).rows[0].id as number;
    producto = await crearProducto('PRODUCTO');
    servicio = await crearProducto('SERVICIO');
    const anexo = async (tipo: string, nombre: string) =>
      (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    provA = await anexo('Proveedor', 'E2E-TP Proveedor A');
    const cliente = await anexo('Cliente', 'E2E-TP Cliente');
    trabajadorId = await anexo('Trabajador', 'E2E-TP Trabajador');
    await db.query(`insert into trabajador (id_anexo) values ($1)`, [trabajadorId]);
    await db.query(`update usuarios set id_trabajador = $1 where "IdUsuario" = $2`, [trabajadorId, USUARIO_E2E]);

    cc = (
      await db.query(
        `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ('E2E-TP-OBRA', 'ABIERTO', $1, $2, 2026, $3) returning id`,
        [inicio, fin, cliente],
      )
    ).rows[0].id;
    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-TP-F1', 'E2E TP FASE 1')`);
    await db.query(`insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion") values ('E2E-TP-C1', 'E2E-TP-F1', 'E2E TP SUBFASE 1'), ('E2E-TP-C2', 'E2E-TP-F1', 'E2E TP SUBFASE 2')`);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    idPpto = (await api().post('/presupuestos').send({ IdPresupuesto: 'E2E-TP-P1', id_centro_costo: cc, TipoPpto: 'Principal', Proyecto: 'E2E TP', Estado: 'PENDIENTE' }).expect(201)).body.id;
    const detalle = 'E2E-TP-DF';
    const cats: Array<{ cat: string; items: Array<[number, number, number]> }> = [
      { cat: 'E2E-TP-C1', items: [[servicio, 4, 250], [producto, 1, 100]] },
      { cat: 'E2E-TP-C2', items: [[servicio, 2, 500]] },
    ];
    const costos = cats.map((c) => redondear2(c.items.reduce((a, [, q, p]) => a + redondear2(q * p), 0)));
    idFase = (
      await db.query(`insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase", "CostoDirecto") values ($1, 'E2E-TP-P1', $2, 'E2E-TP-F1', $3) returning id`, [
        detalle,
        cc,
        costos.reduce((a, b) => a + b, 0),
      ])
    ).rows[0].id;
    const items: number[] = [];
    for (const [j, c] of cats.entries()) {
      const idCat = (
        await db.query(
          `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria", "CostoDirecto")
           values ($1, 'E2E-TP-P1', $2, $3, 'E2E-TP-F1', $4, $5) returning id`,
          [`E2E-TP-DC-${j}`, detalle, cc, c.cat, costos[j]],
        )
      ).rows[0].id as number;
      if (j === 0) sub1 = idCat;
      else sub2 = idCat;
      for (const [k, [idProd, q, p]] of c.items.entries()) {
        items.push(
          (
            await db.query(
              `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "Orden")
               values ($1, 'E2E-TP-P1', $2, $3, $4, $5, $6, $7) returning id`,
              [idCat, idProd, unidad, q, p, redondear2(q * p), k],
            )
          ).rows[0].id as number,
        );
      }
    }
    [item1, item3, item2] = items; // orden de inserción: C1 (servicio, producto), C2 (servicio)
  });

  afterAll(async () => {
    if (db) {
      const ccs = `(select id from "CentroCostos" where centro_costo like 'E2E-TP-%')`;
      await db.query(`delete from pago_programado where id_documento_origen in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "documentosOrigen" where id_centro_costo in ${ccs}`);
      await db.query(`update requerimiento set id_cotizacion_ganadora = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from cotizacion where id_requerimiento in (select id from requerimiento where id_centro_costo in ${ccs})`);
      await db.query(`delete from requerimiento where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal_Historial" where "IdPresupuesto" in (select "IdPresupuesto" from "ppto_Principal" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-TP-%'`);
      await db.query(`delete from "ppto_FasesCategorias" where "IdpptoFaseCategoria" like 'E2E-TP-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-TP-%'`);
      await borrarUsuarioE2E(db);
      await db.query(`delete from trabajador where id_anexo in (select id from anexos where "Anexo" like 'E2E-TP %')`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-TP %'`);
      await db.query(`delete from producto where id = any($1)`, [[producto, servicio].filter(Boolean)]);
      await db.end();
    }
    await app?.close();
  });

  // ─── Comercial por ítem ─────────────────────────────────────────────────────
  describe('el presupuesto Comercial se calcula por ítem y el Meta no cambia', () => {
    it('sin adjudicar nada, el Comercial es el Meta', async () => {
      const c = await comercial();
      expect(c.fases[0]).toMatchObject({ meta: 2100, comercial: 2100, fuente: 'META', items_adjudicados: 0 });
      expect(c.total).toEqual({ meta: 2100, comercial: 2100, diferencia: 0 });
    });

    it('con una subpartida adjudicada la fase es mixta: sus ítems al precio del proveedor y el resto al Meta', async () => {
      // La subpartida 1 (ítems 1 y 3: pesos 1000 y 100 en el Meta) se cotiza con un total de 880: al ítem 1 le tocan 800 y al ítem 3, 80.
      await api()
        .post(`/presupuestos/${idPpto}/cotizaciones`)
        .send({
          id_detalle_categoria: sub1,
          id_proveedor: provA,
          total: '880',
          fecha: hoy,
          moneda_id: 'PEN',
          moneda_simbolo: 'S/',
          forma_pago: 'Contado',
          adelanto_porcentaje: '30',
          plazo_entrega_dias: 20,
          garantia: '6 MESES',
          adjudicar: true,
        })
        .expect(201);

      const c = await comercial();
      expect(c.fases[0]).toMatchObject({ meta: 2100, comercial: 1880, fuente: 'MIXTA', items_adjudicados: 2, sin_tipo_cambio: false });
      const i1 = c.fases[0].items.find((i: { id_item: number }) => i.id_item === item1);
      expect(i1).toMatchObject({ meta: 1000, comercial: 800, diferencia: -200, diferencia_pct: -20, adjudicado: true, proveedor: 'E2E-TP Proveedor A' });
      expect(c.fases[0].items.find((i: { id_item: number }) => i.id_item === item3)).toMatchObject({ meta: 100, comercial: 80, adjudicado: true });
      expect(c.fases[0].items.find((i: { id_item: number }) => i.id_item === item2)).toMatchObject({ comercial: 1000, diferencia: 0, adjudicado: false });
      expect(c.total).toEqual({ meta: 2100, comercial: 1880, diferencia: -220 });
    });

    it('con todo adjudicado la fase vale la suma de sus ítems; los FUR generados no se suman otra vez', async () => {
      // La subpartida 2 (ítem 2, 2 × 500 en el Meta) se cotiza con un total de 800.
      await api()
        .post(`/presupuestos/${idPpto}/cotizaciones`)
        .send({ id_detalle_categoria: sub2, id_proveedor: provA, total: '800', fecha: hoy, moneda_id: 'PEN', moneda_simbolo: 'S/', forma_pago: 'Contado', adjudicar: true })
        .expect(201);
      const c = await comercial();
      expect(c.fases[0]).toMatchObject({ meta: 2100, comercial: 1680, fuente: 'ADJUDICACION', items_adjudicados: 3, requerimientos: [] });
      expect(c.total).toEqual({ meta: 2100, comercial: 1680, diferencia: -420 });
      // El Meta sigue siendo el de la plantilla: no se tocó el costo de ningún ítem.
      expect((await db.query(`select sum("CostoTotal")::float as s from "ppto_DetalleItems" where "IdPresupuesto" = 'E2E-TP-P1'`)).rows[0].s).toBe(2100);
    });
  });

  // ─── Aprobar y programar ────────────────────────────────────────────────────
  describe('la orden de servicio libera el adelanto y después el avance de obra', () => {
    it('al aprobar el presupuesto nacen la OC (bienes) y la OS (servicios) registradas, con las condiciones de la cotización', async () => {
      await api().post('/presupuestos/E2E-TP-P1/aprobar').expect(200);
      const docs = (await db.query(`select id, clase_documento, estado from "documentosOrigen" where id_centro_costo = $1 order by id`, [cc])).rows;
      expect(docs.map((d) => [d.clase_documento, d.estado]).sort()).toEqual([['ORDEN_COMPRA', 'REGISTRADO'], ['ORDEN_SERVICIO', 'REGISTRADO']]);
      idOs = docs.find((d) => d.clase_documento === 'ORDEN_SERVICIO').id;
      idOc = docs.find((d) => d.clase_documento === 'ORDEN_COMPRA').id;

      // El detalle del documento trae lo que hace falta para imprimir la orden.
      const det = (await api().get(`/administracion/documentos-origen/${idOs}`).expect(200)).body;
      expect(det.cotizacion).toMatchObject({ plazo_entrega_dias: 20, garantia: '6 MESES' });
      expect(num(det.cotizacion.adelanto_porcentaje)).toBe(30);
      netoOs = num(det.neto_proveedor);
      expect(netoOs).toBeGreaterThan(0);
      expect(det.tope_avance).toMatchObject({ adelanto_porcentaje: 30, avance_pct: 0 });
      // La OC (bienes) no lleva tope.
      expect((await api().get(`/administracion/documentos-origen/${idOc}`).expect(200)).body.tope_avance).toBeNull();
    });

    it('sin avance, la programación solo libera el adelanto y propone ese monto', async () => {
      const p = await pendiente(idOs);
      expect(p.tope_avance).toMatchObject({ adelanto_porcentaje: 30, avance_pct: 0, pct_aplicado: 30 });
      expect(p.tope_avance.tope).toBeCloseTo(netoOs * 0.3, 2);
      expect(p.tope_avance.disponible).toBeCloseTo(netoOs * 0.3, 2);
      expect(p.tope_avance.sugerido).toBeCloseTo(netoOs * 0.3, 2);
      expect((await pendiente(idOc)).tope_avance).toBeNull();
    });

    it('programar el adelanto se puede; pasar un centavo del tope es 409, y con «exceder_avance» exige el motivo', async () => {
      const adelanto = redondear2(netoOs * 0.3);
      await programar(idOs, adelanto).expect(201);
      const res = await programar(idOs, 10).expect(409);
      expect(res.body.message).toMatch(/supera lo que libera el avance de obra/);
      expect(res.body.message).toMatch(/adelanto 30 %/);
      // Por encima del avance, con permiso pero sin motivo: 400; con motivo: se programa y queda marcado.
      await programar(idOs, 10, { exceder_avance: true, observaciones: '' }).expect(400);
      const ok = (await programar(idOs, 10, { exceder_avance: true, observaciones: 'URGE EL MATERIAL' }).expect(201)).body;
      const fila = (Array.isArray(ok) ? ok : ok.items ?? [ok])[0];
      expect(fila.observaciones).toBe('[POR ENCIMA DEL AVANCE] URGE EL MATERIAL');
      await api().post(`/tesoreria/programacion/${fila.id}/cancelar`).expect(200);
    });

    it('al registrar avance de obra se libera más: el tope sigue al avance ponderado por el monto', async () => {
      // La ficha necesita al menos el jefe de proyecto para entrar al control de avance; se pone la obra en ejecución.
      await api().patch(`${obra()}/generales`).send({ id_distrito: '150101', id_jefe_proyecto: trabajadorId }).expect(200);
      await api().post(`${obra()}/estado`).send({ estado: 'EN_EJECUCION' }).expect(201);
      // Subfase 1 al 100 %, subfase 2 al 0 %: las dos líneas de la OS pesan lo mismo (800 y 800).
      await avance(1, [[sub1, 100], [sub2, 0]]);

      const p = await pendiente(idOs);
      expect(p.tope_avance.avance_pct).toBe(50);
      expect(p.tope_avance).toMatchObject({ adelanto_porcentaje: 30, pct_aplicado: 50 });
      expect(p.tope_avance.tope).toBeCloseTo(netoOs * 0.5, 2);
      expect(p.tope_avance.programado).toBeCloseTo(netoOs * 0.3, 2);
      expect(p.tope_avance.disponible).toBeCloseTo(netoOs * 0.2, 2);
      expect(p.tope_avance.sugerido).toBeCloseTo(netoOs * 0.2, 2); // ya hay un pago: se propone lo que el avance liberó
    });

    it('se puede programar lo liberado por el avance y no más', async () => {
      const p = await pendiente(idOs);
      await programar(idOs, redondear2(p.tope_avance.disponible)).expect(201);
      await programar(idOs, 1).expect(409);
      expect((await pendiente(idOs)).tope_avance.disponible).toBeCloseTo(0, 1);
    });

    it('la valorización muestra el avance por línea, lo liberado, lo programado y lo disponible', async () => {
      const v = (await api().get(`/administracion/documentos-origen/${idOs}/valorizacion`).expect(200)).body;
      expect(v).toMatchObject({ adelanto_porcentaje: 30, avance_pct: 50, pct_aplicado: 50 });
      expect(num(v.liberado)).toBeCloseTo(netoOs * 0.5, 2);
      expect(num(v.programado)).toBeCloseTo(netoOs * 0.5, 2);
      expect(num(v.disponible)).toBeCloseTo(0, 1);
      expect(v.lineas).toHaveLength(2);
      const l1 = v.lineas.find((l: { id_subfase: number }) => l.id_subfase === sub1);
      const l2 = v.lineas.find((l: { id_subfase: number }) => l.id_subfase === sub2);
      expect(l1).toMatchObject({ avance_pct: 100, subfase: 'E2E TP SUBFASE 1' });
      expect(num(l1.monto)).toBe(800);
      expect(num(l1.monto_valorizado)).toBe(800);
      expect(l2).toMatchObject({ avance_pct: 0 });
      expect(num(l2.monto_valorizado)).toBe(0);
    });

    it('una orden de compra (bienes) no lleva valorización por avance (400)', async () => {
      await api().get(`/administracion/documentos-origen/${idOc}/valorizacion`).expect(400);
      await api().get('/administracion/documentos-origen/999999999/valorizacion').expect(404);
    });

    it('al completar el avance de la subfase 2 se libera el resto', async () => {
      await avance(2, [[sub2, 100]]);
      const p = await pendiente(idOs);
      expect(p.tope_avance).toMatchObject({ avance_pct: 100, pct_aplicado: 100 });
      expect(p.tope_avance.tope).toBeCloseTo(netoOs, 2);
      expect(p.tope_avance.disponible).toBeCloseTo(netoOs * 0.5, 2);
    });
  });
});
