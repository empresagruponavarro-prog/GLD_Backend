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
 * Plan 12, C-1, contra la BD de DATABASE_URL: un proveedor que gana varias subpartidas de la misma fase recibe **una orden por cada conjunto de
 * condiciones** (adelanto, IGV, forma de pago…). Antes se juntaban todas y la orden tomaba las condiciones de la primera cotización: el
 * adelanto salía mal y, si una oferta incluía IGV y otra no, hasta el monto.
 * Crea sus centros de costo (`E2E-CC-*`) y los elimina al final.
 */
describe('Conciliación: una orden por (fase, proveedor, condiciones) (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  let servicio = 0;
  let unidad = 0;
  let provA = 0;
  let trabajadorId = 0;
  let idPpto = 0;
  let subs: number[] = [];

  const api = () => apiConSesion(app);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const cotizar = (idSub: number, total: string, extra: Record<string, unknown>) =>
    api()
      .post(`/presupuestos/${idPpto}/cotizaciones`)
      .send({ id_detalle_categoria: idSub, id_proveedor: provA, total, fecha: hoy, moneda_id: 'PEN', moneda_simbolo: 'S/', forma_pago: 'Contado', adjudicar: true, ...extra });

  const ordenes = async () =>
    (
      await db.query(
        `select d.id, d.clase_documento, d.estado, d.monto::float as monto, d.igv::float as igv, d.total::float as total, d.id_requerimiento, d.id_cotizacion
           from "documentosOrigen" d join requerimiento r on r.id = d.id_requerimiento
          where r.id_ppto_principal = $1 and r.estado <> 'ANULADO' and d.estado <> 'ANULADO' order by d.id`,
        [idPpto],
      )
    ).rows;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id;
    const categoria = (await db.query(`select id from categoria order by id limit 1`)).rows[0].id as number;
    servicio = (
      await db.query(`insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, 'SERVICIO DE PRUEBA CONDICIONES', $2, $3, 'SERVICIO') returning id`, [
        `ZZ-CC-${Math.random().toString(36).slice(2, 8)}`,
        categoria,
        unidad,
      ])
    ).rows[0].id as number;
    const anexo = async (tipo: string, nombre: string) =>
      (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    provA = await anexo('Proveedor', 'E2E-CC Proveedor A');
    const cliente = await anexo('Cliente', 'E2E-CC Cliente');
    trabajadorId = await anexo('Trabajador', 'E2E-CC Trabajador');
    await db.query(`insert into trabajador (id_anexo) values ($1)`, [trabajadorId]);
    await db.query(`update usuarios set id_trabajador = $1 where "IdUsuario" = $2`, [trabajadorId, USUARIO_E2E]);
    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-CC-F1', 'E2E CC FASE 1')`);
    await db.query(`insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion") values ('E2E-CC-C1', 'E2E-CC-F1', 'E2E CC SUB 1'), ('E2E-CC-C2', 'E2E-CC-F1', 'E2E CC SUB 2'), ('E2E-CC-C3', 'E2E-CC-F1', 'E2E CC SUB 3')`);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const cc = (
      await db.query(`insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ('E2E-CC-OBRA', 'ABIERTO', $1, $2, 2026, $3) returning id`, [inicio, fin, cliente])
    ).rows[0].id as number;
    idPpto = (await api().post('/presupuestos').send({ IdPresupuesto: 'E2E-CC-P1', id_centro_costo: cc, TipoPpto: 'Principal', Proyecto: 'E2E CC', Estado: 'PENDIENTE' }).expect(201)).body.id as number;
    const items: Array<[number, number]> = [[2, 500], [1, 800], [1, 200]]; // cantidad × precio: 1000, 800 y 200 en el Meta
    await db.query(`insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase", "CostoDirecto") values ('E2E-CC-DF', 'E2E-CC-P1', $1, 'E2E-CC-F1', 2000)`, [cc]);
    for (const [k, [q, p]] of items.entries()) {
      const idCat = (
        await db.query(
          `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria", "CostoDirecto")
           values ($1, 'E2E-CC-P1', 'E2E-CC-DF', $2, 'E2E-CC-F1', $3, $4) returning id`,
          [`E2E-CC-DC-${k}`, cc, `E2E-CC-C${k + 1}`, r2(q * p)],
        )
      ).rows[0].id as number;
      subs.push(idCat);
      await db.query(
        `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "CostoTotalMeta", "Orden")
         values ($1, 'E2E-CC-P1', $2, $3, $4, $5, $6, $6, 0)`,
        [idCat, servicio, unidad, q, p, r2(q * p)],
      );
    }
  });

  afterAll(async () => {
    if (db) {
      const ccs = `(select id from "CentroCostos" where centro_costo like 'E2E-CC-%')`;
      await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "documentosOrigen" where id_centro_costo in ${ccs}`);
      await db.query(`update requerimiento set id_cotizacion_ganadora = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from cotizacion where id_requerimiento in (select id from requerimiento where id_centro_costo in ${ccs})`);
      await db.query(`delete from requerimiento where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal_Historial" where "IdPresupuesto" in (select "IdPresupuesto" from "ppto_Principal" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-CC-%'`);
      await db.query(`delete from "ppto_FasesCategorias" where "IdpptoFaseCategoria" like 'E2E-CC-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-CC-%'`);
      await borrarUsuarioE2E(db);
      await db.query(`delete from trabajador where id_anexo in (select id from anexos where "Anexo" like 'E2E-CC %')`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-CC %'`);
      await db.query(`delete from producto where id = $1`, [servicio]);
      await db.end();
    }
    await app?.close();
  });

  it('una subpartida con IGV incluido y 15 % de adelanto genera su orden', async () => {
    await cotizar(subs[0], '1180', { incluye_igv: true, adelanto_porcentaje: '15' }).expect(201);
    const os = await ordenes();
    expect(os).toHaveLength(1);
    expect(os[0]).toMatchObject({ clase_documento: 'ORDEN_SERVICIO', estado: 'PROVISIONAL', monto: 1000, igv: 180, total: 1180 });
  });

  it('otra subpartida del mismo proveedor con 20 % de adelanto NO se mezcla: tiene su propia orden con su propio adelanto', async () => {
    const res = await cotizar(subs[1], '800', { incluye_igv: false, adelanto_porcentaje: '20' }).expect(201);
    expect(res.body.compromisos.creados).toHaveLength(1);
    const os = await ordenes();
    expect(os).toHaveLength(2);
    expect(os.map((o) => o.monto).sort((a, b) => a - b)).toEqual([800, 1000]);
    const adelantos = [] as number[];
    for (const o of os) adelantos.push(Number((await api().get(`/administracion/documentos-origen/${o.id}`).expect(200)).body.cotizacion.adelanto_porcentaje));
    expect(adelantos.sort()).toEqual([15, 20]);
    expect(new Set(os.map((o) => o.id_requerimiento)).size).toBe(2); // un FUR por cada una
  });

  it('con las mismas condiciones sí se juntan, y si una oferta incluye IGV y la otra no, cada monto se respeta', async () => {
    // La tercera subpartida: 15 % de adelanto como la primera, pero con precio sin IGV. Se une a la primera orden.
    const res = await cotizar(subs[2], '200', { incluye_igv: false, adelanto_porcentaje: '15' }).expect(201);
    expect(res.body.compromisos.actualizados).toHaveLength(1);
    expect(res.body.compromisos.creados).toEqual([]);
    const os = await ordenes();
    expect(os).toHaveLength(2);
    const unida = os.find((o) => o.monto === 1200)!;
    // 1000 (la oferta con IGV incluido, pasada a sin IGV) + 200 (la oferta sin IGV): antes salía 1169,49 porque la segunda se dividía entre 1,18.
    expect(unida).toMatchObject({ monto: 1200, igv: 216, total: 1416 });
    expect(os.find((o) => o.monto === 800)).toMatchObject({ igv: 144, total: 944 });
    const lineas = (await db.query(`select (cantidad * precio_unitario)::float as m from cotizacion_detalle where id_cotizacion = $1 order by id`, [unida.id_cotizacion])).rows.map((l) => l.m);
    expect(r2(lineas.reduce((a, b) => a + b, 0))).toBe(1200); // la copia de la cotización también cuadra
    expect((await db.query(`select incluye_igv from cotizacion where id = $1`, [unida.id_cotizacion])).rows[0].incluye_igv).toBe(false);
  });

  it('grabar otra vez sin cambios no escribe nada: mismos FUR, mismas órdenes', async () => {
    const antes = await ordenes();
    const r = (await api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ id_detalle_categoria: subs[1], id_cotizacion: (await db.query(`select id from ppto_cotizacion where id_detalle_categoria = $1`, [subs[1]])).rows[0].id }).expect(200)).body;
    expect(r.compromisos).toMatchObject({ creados: [], actualizados: [], anulados: [], sin_cambio: 2 });
    expect(await ordenes()).toEqual(antes);
  });

  it('cambiar las condiciones de la subpartida que quedó sola actualiza su mismo FUR (conserva el número)', async () => {
    const antes = (await ordenes()).find((o) => o.monto === 800)!;
    const numero = (await db.query(`select numero_documento from "documentosOrigen" where id = $1`, [antes.id])).rows[0].numero_documento;
    const idCot = (await db.query(`select id from ppto_cotizacion where id_detalle_categoria = $1`, [subs[1]])).rows[0].id;
    await api().patch(`/presupuestos/${idPpto}/cotizaciones/${idCot}`).send({ adelanto_porcentaje: '30' }).expect(200);
    const despues = (await ordenes()).find((o) => o.monto === 800)!;
    expect(despues.id).toBe(antes.id);
    expect((await db.query(`select numero_documento from "documentosOrigen" where id = $1`, [despues.id])).rows[0].numero_documento).toBe(numero);
    expect(Number((await api().get(`/administracion/documentos-origen/${despues.id}`).expect(200)).body.cotizacion.adelanto_porcentaje)).toBe(30);
  });
});
