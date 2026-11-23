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
 * Compromisos del presupuesto Meta (plan 09, F3) contra la BD de DATABASE_URL: al grabar cotizaciones y adjudicaciones se generan y
 * mantienen el FUR aprobado y sus órdenes provisionales; al aprobar el presupuesto se cierran y pasan a tesorería.
 * Crea sus centros de costo (`E2E-PK-*`) y los elimina al final.
 */
describe('Presupuesto Meta: compromisos (FUR y órdenes) que se generan al grabar (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  let ccObra = 0;
  let producto = 0;
  let servicio = 0;
  let unidad = 0;
  let provA = 0;
  let provB = 0;
  let trabajadorId = 0;
  let idPpto = 0;
  let idFaseMaestra1 = 0;
  // Cada ítem es su propia subpartida (la cotización es por subpartida: un total por proveedor, aquí igual a cantidad × precio).
  let item1 = 0; // producto 10 × S/ 5, subpartida c1
  let item2 = 0; // servicio 2 × S/ 15, subpartida c2
  let item3 = 0; // producto 4 × S/ 6, subpartida c3
  let item4 = 0; // fase 2: producto 3 × S/ 8, subpartida c4
  let c1 = 0;
  let c2 = 0;
  let c3 = 0;
  let c4 = 0;
  let cotA = 0; // proveedor A en c1
  let cotA2 = 0; // proveedor A en c2
  let cotA3 = 0; // proveedor A en c3
  let cotB = 0; // proveedor B en c3

  const api = () => apiConSesion(app);
  const redondear2 = (n: number) => Math.round(n * 100) / 100;
  const cuerpo = (idSub: number, idProveedor: number, total: string, extra: Record<string, unknown> = {}) => ({
    id_detalle_categoria: idSub,
    id_proveedor: idProveedor,
    total,
    fecha: hoy,
    moneda_id: 'PEN',
    moneda_simbolo: 'S/',
    forma_pago: 'Contado',
    ...extra,
  });
  const adjudicar = (idSub: number, idCotizacion: number | null) =>
    api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ id_detalle_categoria: idSub, id_cotizacion: idCotizacion });

  // ─── lecturas directas de la BD ─────────────────────────────────────────────
  const furs = async (soloVigentes = false) =>
    (await db.query(`select * from requerimiento where id_ppto_principal = $1 ${soloVigentes ? `and estado <> 'ANULADO'` : ''} order by id`, [idPpto])).rows;
  const docs = async (idFur: number) =>
    (
      await db.query(
        `select id, numero_documento, clase_documento, estado, monto::float as monto, igv::float as igv, total::float as total, id_anexo, id_cotizacion, forma_pago, dias_credito,
                fecha_emision::date::text as fecha, comentarios
           from "documentosOrigen" where id_requerimiento = $1 order by id`,
        [idFur],
      )
    ).rows;
  const lineasDe = async (idFur: number) =>
    (await db.query(`select id_ppto_item, id_ppto_detalle_categoria, cantidad::float as cantidad, cantidad_aprobada::float as aprobada, precio_referencial::float as ref from requerimiento_detalle where id_requerimiento = $1 order by id`, [idFur])).rows;
  const claseDe = (d: { clase_documento: string }) => d.clase_documento;
  const vigentes = async (idFur: number) => (await docs(idFur)).filter((d) => d.estado !== 'ANULADO');

  const armar = async (codigo: string, idCc: number, fase: string, cats: Array<{ cat: string; items: Array<[number, number, number]> }>) => {
    const idDetalle = `E2E-PK-DF-${codigo}-${fase}`;
    const costoCats = cats.map((c) => redondear2(c.items.reduce((a, [, q, p]) => a + redondear2(q * p), 0)));
    const idFase = (
      await db.query(
        `insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase", "CostoDirecto") values ($1, $2, $3, $4, $5) returning id`,
        [idDetalle, codigo, idCc, fase, redondear2(costoCats.reduce((a, b) => a + b, 0))],
      )
    ).rows[0].id as number;
    const items: number[] = [];
    const subfases: number[] = [];
    for (const [j, c] of cats.entries()) {
      const id = (
        await db.query(
          `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria", "CostoDirecto")
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [`E2E-PK-DC-${codigo}-${fase}-${j}`, codigo, idDetalle, idCc, fase, c.cat, costoCats[j]],
        )
      ).rows[0].id as number;
      subfases.push(id);
      for (const [k, [idProd, q, p]] of c.items.entries()) {
        items.push(
          (
            await db.query(
              `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "CostoTotalMeta", "Orden")
               values ($1, $2, $3, $4, $5, $6, $7, $7, $8) returning id`,
              [id, codigo, idProd, unidad, q, p, redondear2(q * p), k],
            )
          ).rows[0].id as number,
        );
      }
    }
    return { idFase, items, subfases };
  };

  async function crearProducto(tipo: 'PRODUCTO' | 'SERVICIO'): Promise<number> {
    const categoria = (await db.query(`select id from categoria order by id limit 1`)).rows[0].id as number;
    return (
      await db.query(`insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, $3, $4, $5) returning id`, [
        `ZZ-PK-${Math.random().toString(36).slice(2, 8)}`,
        `${tipo} DE PRUEBA COMPROMISOS`,
        categoria,
        unidad,
        tipo,
      ])
    ).rows[0].id;
  }

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id;
    producto = await crearProducto('PRODUCTO');
    servicio = await crearProducto('SERVICIO');
    const anexo = async (tipo: string, nombre: string) =>
      (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    provA = await anexo('Proveedor', 'E2E-PK Proveedor A');
    provB = await anexo('Proveedor', 'E2E-PK Proveedor B');
    const cliente = await anexo('Cliente', 'E2E-PK Cliente');
    trabajadorId = await anexo('Trabajador', 'E2E-PK Trabajador');
    await db.query(`insert into trabajador (id_anexo) values ($1)`, [trabajadorId]);
    // Quien registra aprueba (respuesta 2): el usuario tiene un trabajador vinculado.
    await db.query(`update usuarios set id_trabajador = $1 where "IdUsuario" = $2`, [trabajadorId, USUARIO_E2E]);

    ccObra = (
      await db.query(
        `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ('E2E-PK-OBRA', 'ABIERTO', $1, $2, 2026, $3) returning id`,
        [inicio, fin, cliente],
      )
    ).rows[0].id;

    idFaseMaestra1 = (await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-PK-F1', 'E2E PK FASE 1') returning id`)).rows[0].id;
    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-PK-F2', 'E2E PK FASE 2')`);
    await db.query(
      `insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion")
       values ('E2E-PK-C1', 'E2E-PK-F1', 'E2E PK MATERIALES'), ('E2E-PK-C2', 'E2E-PK-F1', 'E2E PK SERVICIOS'), ('E2E-PK-C3', 'E2E-PK-F1', 'E2E PK OTROS')`,
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    idPpto = (await api().post('/presupuestos').send({ IdPresupuesto: 'E2E-PK-P1', id_centro_costo: ccObra, TipoPpto: 'Principal', Proyecto: 'E2E PK', Estado: 'PENDIENTE' }).expect(201)).body.id;
    const f1 = await armar('E2E-PK-P1', ccObra, 'E2E-PK-F1', [
      { cat: 'E2E-PK-C1', items: [[producto, 10, 5]] },
      { cat: 'E2E-PK-C2', items: [[servicio, 2, 15]] },
      { cat: 'E2E-PK-C3', items: [[producto, 4, 6]] },
    ]);
    [item1, item2, item3] = f1.items;
    [c1, c2, c3] = f1.subfases;
    const f2 = await armar('E2E-PK-P1', ccObra, 'E2E-PK-F2', [{ cat: 'E2E-PK-C1', items: [[producto, 3, 8]] }]);
    [item4] = f2.items;
    [c4] = f2.subfases;
  });

  afterAll(async () => {
    if (db) {
      const ccs = `(select id from "CentroCostos" where centro_costo like 'E2E-PK-%')`;
      await db.query(`delete from pago_programado where id_documento_origen in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "documentosOrigen" where id_centro_costo in ${ccs}`);
      await db.query(`update requerimiento set id_cotizacion_ganadora = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from cotizacion where id_requerimiento in (select id from requerimiento where id_centro_costo in ${ccs})`);
      await db.query(`delete from requerimiento where id_centro_costo in ${ccs}`);
      await db.query(`delete from obra_datos_generales where id_centro_costo in ${ccs}`);
      await db.query(`delete from obra_partida where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal_Historial" where "IdPresupuesto" in (select "IdPresupuesto" from "ppto_Principal" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-PK-%'`);
      await db.query(`delete from "ppto_FasesCategorias" where "IdpptoFaseCategoria" like 'E2E-PK-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-PK-%'`);
      await borrarUsuarioE2E(db);
      await db.query(`delete from trabajador where id_anexo in (select id from anexos where "Anexo" like 'E2E-PK %')`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-PK %'`);
      await db.query(`delete from producto where id = any($1)`, [[producto, servicio].filter(Boolean)]);
      await db.end();
    }
    await app?.close();
  });

  // ─── Generar al grabar ──────────────────────────────────────────────────────
  describe('al grabar, el FUR aprobado y sus órdenes provisionales se generan solos', () => {
    it('cotizar y adjudicar genera un FUR por fase y proveedor, con una OC (bienes) y una OS (servicios) provisionales', async () => {
      // El proveedor A gana las tres subpartidas de la fase: la primera crea el FUR; las demás lo completan.
      const res = await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c1, provA, '45', { adjudicar: true })).expect(201); // 10 × 4.50
      cotA = res.body.id;
      expect(res.body.compromisos.creados).toHaveLength(1);
      expect(res.body.compromisos.creados[0].documentos.map((d: { clase: string }) => d.clase)).toEqual(['ORDEN_COMPRA']);
      const r2 = await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c2, provA, '40', { adjudicar: true })).expect(201); // 2 × 20
      cotA2 = r2.body.id;
      expect(r2.body.compromisos.creados).toEqual([]);
      expect(r2.body.compromisos.actualizados).toHaveLength(1);
      expect(r2.body.compromisos.actualizados[0].documentos.map((d: { clase: string }) => d.clase).sort()).toEqual(['ORDEN_COMPRA', 'ORDEN_SERVICIO']);
      const r3 = await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c3, provA, '20', { adjudicar: true })).expect(201); // 4 × 5
      cotA3 = r3.body.id;
      expect(r3.body.compromisos.actualizados).toHaveLength(1);

      const [fur, ...otros] = await furs();
      expect(otros).toHaveLength(0);
      expect(fur).toMatchObject({ estado: 'APROBADO', tipo: 'COMPRA', origen: 'PPTO_ADJUDICACION', id_ppto_principal: idPpto, id_fase: idFaseMaestra1, id_solicitante: trabajadorId, id_aprobador: trabajadorId });
      expect(fur.numero).toMatch(/^FUR-\d{6}$/);
      expect(fur.id_cotizacion_ganadora).not.toBeNull();
      expect(fur.justificacion).toContain('E2E-PK-P1');

      const lineas = await lineasDe(fur.id);
      expect(lineas).toHaveLength(3);
      expect(lineas.find((l) => l.id_ppto_item === item1)).toMatchObject({ cantidad: 10, aprobada: 10, ref: 5 }); // precio referencial = costo del Meta
      expect(new Set(lineas.map((l) => l.id_ppto_item))).toEqual(new Set([item1, item2, item3]));
      expect(lineas.every((l) => l.id_ppto_detalle_categoria !== null)).toBe(true);

      const ds = await docs(fur.id);
      const oc = ds.find((d) => claseDe(d) === 'ORDEN_COMPRA');
      const os = ds.find((d) => claseDe(d) === 'ORDEN_SERVICIO');
      expect(oc).toMatchObject({ estado: 'PROVISIONAL', id_anexo: provA, monto: 65, igv: 11.7, total: 76.7, fecha: hoy }); // 10 × 4.50 + 4 × 5.00
      expect(os).toMatchObject({ estado: 'PROVISIONAL', id_anexo: provA, monto: 40, igv: 7.2, total: 47.2 });
      expect(oc.numero_documento).toMatch(/^OC-\d{6}$/);
      expect(os.numero_documento).toMatch(/^OS-\d{6}$/);
      expect(oc.id_cotizacion).toBe(fur.id_cotizacion_ganadora);

      // La cotización ganadora viaja copiada al FUR (con una línea por ítem) y el historial queda escrito.
      const copia = (await db.query(`select numero, id_proveedor, (select count(*)::int from cotizacion_detalle where id_cotizacion = c.id) as lineas from cotizacion c where id = $1`, [fur.id_cotizacion_ganadora])).rows[0];
      expect(copia).toMatchObject({ id_proveedor: provA, lineas: 3 });
      const eventos = (await db.query(`select accion from requerimiento_evento where id_requerimiento = $1 order by id`, [fur.id])).rows.map((e) => e.accion);
      expect(eventos).toEqual(['CREAR', 'APROBAR']);
    });

    it('el FUR y el panel de compromisos lo muestran como «desde presupuesto» y provisional', async () => {
      const [fur] = await furs();
      const f = (await api().get(`/requerimientos/${fur.id}`).expect(200)).body;
      expect(f).toMatchObject({ origen: 'PPTO_ADJUDICACION', id_ppto_principal: idPpto, codigo_presupuesto: 'E2E-PK-P1', provisional: true, estado: 'APROBADO' });
      const lista = (await api().get('/requerimientos?origen=PPTO_ADJUDICACION&pageSize=100').expect(200)).body;
      expect(lista.data.some((r: { id: number }) => r.id === fur.id)).toBe(true);
      expect((await api().get('/requerimientos?origen=MANUAL&pageSize=100').expect(200)).body.data.some((r: { id: number }) => r.id === fur.id)).toBe(false);

      const panel = (await api().get(`/presupuestos/${idPpto}/compromisos`).expect(200)).body;
      expect(panel).toMatchObject({ codigo_presupuesto: 'E2E-PK-P1', items_total: 4, items_adjudicados: 3 });
      expect(panel.items_sin_adjudicar.map((i: { id_ppto_item: number }) => i.id_ppto_item)).toEqual([item4]);
      expect(panel.compromisos).toHaveLength(1);
      expect(panel.compromisos[0]).toMatchObject({ numero: fur.numero, estado: 'PROVISIONAL', proveedor: 'E2E-PK Proveedor A', lineas: 3 });
      expect(panel.compromisos[0].documentos.map((d: { estado: string }) => d.estado)).toEqual(['PROVISIONAL', 'PROVISIONAL']);
    });

    it('grabar sin cambios no escribe nada: mismos FUR, mismas órdenes y mismos números', async () => {
      const antes = await furs();
      const docsAntes = await docs(antes[0].id);
      const r = (await adjudicar(c1, cotA).expect(200)).body;
      expect(r.compromisos).toEqual({ creados: [], actualizados: [], anulados: [], sin_cambio: 1 });
      expect(await furs()).toEqual(antes);
      expect(await docs(antes[0].id)).toEqual(docsAntes);
    });

    it('cambiar un precio actualiza el mismo FUR y las mismas órdenes (no crea números nuevos)', async () => {
      const [fur] = await furs();
      const ocAntes = (await docs(fur.id)).find((d) => claseDe(d) === 'ORDEN_COMPRA');
      const res = await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ total: '40' }).expect(200); // 10 × 4
      expect(res.body.compromisos.actualizados).toHaveLength(1);
      expect(res.body.compromisos.actualizados[0].numero).toBe(fur.numero);
      expect(await furs()).toHaveLength(1);
      const oc = (await docs(fur.id)).find((d) => claseDe(d) === 'ORDEN_COMPRA');
      expect(oc).toMatchObject({ id: ocAntes.id, numero_documento: ocAntes.numero_documento, estado: 'PROVISIONAL', monto: 60, igv: 10.8, total: 70.8 }); // 10 × 4 + 4 × 5
      expect((await lineasDe(fur.id)).length).toBe(3);
    });

    it('cambiar las condiciones de la cotización (forma de pago, crédito) llega a la orden', async () => {
      const [fur] = await furs();
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ forma_pago: 'Credito 30', dias_credito: 30 }).expect(200);
      for (const d of await vigentes(fur.id)) expect(d).toMatchObject({ forma_pago: 'CREDITO 30', dias_credito: 30 });
    });
  });

  // ─── La orden provisional ───────────────────────────────────────────────────
  describe('una orden provisional se ve y se imprime, pero no se programa, paga, recibe ni edita a mano', () => {
    it('aparece en administración con estado de pago PROVISIONAL', async () => {
      const [fur] = await furs();
      const oc = (await docs(fur.id)).find((d) => claseDe(d) === 'ORDEN_COMPRA');
      const lista = (await api().get(`/administracion/documentos-origen?estado_pago=PROVISIONAL&pageSize=100`).expect(200)).body;
      expect(lista.data.find((d: { id: number }) => d.id === oc.id)).toMatchObject({ estado: 'PROVISIONAL', estado_pago: 'PROVISIONAL' });
    });

    it('no se programa su pago (409), no se recibe en almacén (409) ni se anula o elimina a mano (409)', async () => {
      const [fur] = await furs();
      const oc = (await docs(fur.id)).find((d) => claseDe(d) === 'ORDEN_COMPRA');
      await api()
        .post('/tesoreria/programacion')
        .send({ items: [{ id_documento_origen: oc.id, fecha_programada: '2026-12-04', monto: '10', medio_pago: 'TRANSFERENCIA', urgente: true, observaciones: 'PRUEBA E2E' }] })
        .expect(409);
      await api().get(`/almacen/recepciones/orden-compra/${oc.id}`).expect(409);
      await api().post(`/administracion/documentos-origen/${oc.id}/anular`).send({}).expect(409);
      await api().patch(`/administracion/documentos-origen/${oc.id}/deducciones`).send({ renta_4ta: 1 }).expect(409);
      await api().delete(`/documentos/origen/${oc.id}`).expect(409);
      await api().post(`/requerimientos/${fur.id}/anular`).send({}).expect(409); // lo gestiona el presupuesto
    });

    it('solo se completan fecha, comentarios y PDF; el resto lo define la cotización (409)', async () => {
      const [fur] = await furs();
      const oc = (await docs(fur.id)).find((d) => claseDe(d) === 'ORDEN_COMPRA');
      const res = await api().patch(`/documentos/origen/${oc.id}`).send({ igv: 5 }).expect(409);
      expect(res.body.message).toMatch(/provisional/);
      await api().patch(`/documentos/origen/${oc.id}`).send({ comentarios: 'LISTO PARA IMPRIMIR' }).expect(200);
      expect((await docs(fur.id)).find((d) => d.id === oc.id).comentarios).toContain('LISTO PARA IMPRIMIR');
    });
  });

  // ─── Cambiar de proveedor, quitar ítems ─────────────────────────────────────
  describe('cambiar de proveedor o quitar ítems mantiene los FUR al día', () => {
    it('el ítem que pasa a otro proveedor sale de un FUR y entra en el del nuevo (se crea el FUR del nuevo)', async () => {
      const res = await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c3, provB, '16')).expect(201); // 4 × 4
      cotB = res.body.id;
      expect(res.body.compromisos.creados).toEqual([]); // cotizar sin adjudicar no genera nada
      const r = (await adjudicar(c3, cotB).expect(200)).body;
      expect(r.compromisos.creados).toHaveLength(1);
      expect(r.compromisos.actualizados).toHaveLength(1);

      const vig = await furs(true);
      expect(vig).toHaveLength(2);
      const deA = vig.find((f) => f.id_cotizacion_ganadora !== null && f.id !== r.compromisos.creados[0].id_requerimiento)!;
      const deB = vig.find((f) => f.id === r.compromisos.creados[0].id_requerimiento)!;
      expect((await lineasDe(deA.id)).map((l) => l.id_ppto_item).sort()).toEqual([item1, item2].sort());
      expect((await lineasDe(deB.id)).map((l) => l.id_ppto_item)).toEqual([item3]);
      expect(await vigentes(deB.id)).toHaveLength(1);
      expect((await vigentes(deB.id))[0]).toMatchObject({ clase_documento: 'ORDEN_COMPRA', id_anexo: provB, monto: 16, estado: 'PROVISIONAL' });
      expect((await vigentes(deA.id)).find((d) => claseDe(d) === 'ORDEN_COMPRA')).toMatchObject({ monto: 40 }); // solo el ítem 1: 10 × 4
    });

    it('una clase que queda sin ítems anula su orden y deja la otra', async () => {
      const [deA] = await furs(true);
      const r = (await adjudicar(c2, null).expect(200)).body;
      expect(r.liberados).toBe(1);
      expect(r.compromisos.actualizados).toHaveLength(1);
      const ds = await docs(deA.id);
      expect(ds.find((d) => claseDe(d) === 'ORDEN_SERVICIO')).toMatchObject({ estado: 'ANULADO' });
      expect(ds.find((d) => claseDe(d) === 'ORDEN_SERVICIO').comentarios).toMatch(/ANULADO: Readjudicado/);
      expect(ds.find((d) => claseDe(d) === 'ORDEN_COMPRA').estado).toBe('PROVISIONAL');
      expect((await lineasDe(deA.id)).map((l) => l.id_ppto_item)).toEqual([item1]);
    });

    it('«Generar FURs» solo ofrece lo que la adjudicación no cubre', async () => {
      const preview = (await api().get('/presupuestos/E2E-PK-P1/furs-preview').expect(200)).body;
      // La fase 1 tiene el ítem 2 sin proveedor; la fase 2, el ítem 4. Los ítems 1 y 3 ya están pedidos.
      const fase1 = preview.fases.find((f: { nombre_fase: string }) => f.nombre_fase === 'E2E PK FASE 1');
      expect(fase1.items.map((i: { id_ppto_item: number }) => i.id_ppto_item)).toEqual([item2]);
      expect(fase1.items_ya_pedidos).toBe(2);
      expect(preview.fases.find((f: { nombre_fase: string }) => f.nombre_fase === 'E2E PK FASE 2').items.map((i: { id_ppto_item: number }) => i.id_ppto_item)).toEqual([item4]);
    });

    it('un FUR que se queda sin ítems adjudicados se anula con todas sus órdenes (y queda su historial)', async () => {
      // Se quita el proveedor de las dos subpartidas que quedaban adjudicadas: cada FUR se anula al quedarse sin ítems.
      const r1 = (await adjudicar(c1, null).expect(200)).body;
      expect(r1.compromisos.anulados).toHaveLength(1);
      const r2 = (await adjudicar(c3, null).expect(200)).body;
      expect(r2.compromisos.anulados).toHaveLength(1);
      expect(await furs(true)).toHaveLength(0);
      for (const f of await furs()) {
        expect(f.estado).toBe('ANULADO');
        expect((await vigentes(f.id)).length).toBe(0);
        const acciones = (await db.query(`select accion from requerimiento_evento where id_requerimiento = $1 order by id`, [f.id])).rows.map((e) => e.accion);
        expect(acciones).toEqual(['CREAR', 'APROBAR', 'ANULAR']);
      }
      const panel = (await api().get(`/presupuestos/${idPpto}/compromisos`).expect(200)).body;
      expect(panel.compromisos.every((c: { estado: string }) => c.estado === 'ANULADO')).toBe(true);
      expect(panel.items_adjudicados).toBe(0);
    });

    it('volver a adjudicar crea un FUR nuevo con número nuevo (los anulados se conservan)', async () => {
      const anulados = await furs();
      const r = (await adjudicar(c1, cotA).expect(200)).body;
      await adjudicar(c2, cotA2).expect(200);
      await adjudicar(c3, cotA3).expect(200);
      expect(r.compromisos.creados).toHaveLength(1);
      const numeroNuevo = r.compromisos.creados[0].numero;
      expect(anulados.map((f) => f.numero)).not.toContain(numeroNuevo);
      expect(await furs()).toHaveLength(anulados.length + 1);
      expect(await furs(true)).toHaveLength(1);
    });

    it('eliminar la cotización ganadora anula su FUR; cambiar la cantidad de un ítem lo actualiza', async () => {
      // Cantidad del ítem 3: 4 → 6; el FUR y la orden toman la nueva cantidad (D-14) y el precio cotizado.
      const cat2 = (await db.query(`select id_detalle_categoria as id from "ppto_DetalleItems" where id = $1`, [item3])).rows[0].id;
      const actuales = (await api().get(`/presupuestos/categorias-asignadas/${cat2}/items`).expect(200)).body;
      const envio = actuales.items.map((i: { id: number; id_producto: number; id_unidad_medida: number; Cantidad: number; CostoUnitario: number; PrecioVenta: number }) => ({
        id: i.id,
        id_producto: i.id_producto,
        id_unidad_medida: i.id_unidad_medida,
        Cantidad: i.id === item3 ? 6 : i.Cantidad,
        CostoUnitario: i.CostoUnitario,
        PrecioVenta: i.PrecioVenta,
      }));
      const res = await api().put(`/presupuestos/categorias-asignadas/${cat2}/items`).send({ items: envio }).expect(200);
      expect(res.body.compromisos.actualizados).toHaveLength(1);
      const [fur] = await furs(true);
      expect((await lineasDe(fur.id)).find((l) => l.id_ppto_item === item3)).toMatchObject({ cantidad: 6, aprobada: 6 });
      expect((await vigentes(fur.id)).find((d) => claseDe(d) === 'ORDEN_COMPRA')).toMatchObject({ monto: 70 }); // 10 × 4 + 6 × 5
      // Vuelve a 4 para no mover los demás montos.
      await api().put(`/presupuestos/categorias-asignadas/${cat2}/items`).send({ items: envio.map((i: { id: number }) => (i.id === item3 ? { ...i, Cantidad: 4 } : i)) }).expect(200);
    });
  });

  // ─── Aprobar el presupuesto ─────────────────────────────────────────────────
  describe('al aprobar el presupuesto se cierran las órdenes y pasan a tesorería', () => {
    it('no se aprueba mientras haya ítems sin proveedor (409 ITEMS_SIN_ADJUDICAR)', async () => {
      const v = (await api().get('/presupuestos/E2E-PK-P1/validacion').expect(200)).body;
      expect(v.puede_aprobar).toBe(false);
      expect(v.bloqueos).toEqual([expect.objectContaining({ codigo: 'ITEMS_SIN_ADJUDICAR' })]);
      expect(v.bloqueos[0].mensaje).toMatch(/Faltan 1 ítem/);
      const res = await api().post('/presupuestos/E2E-PK-P1/aprobar').expect(409);
      expect(res.body.message).toMatch(/por adjudicar/);
      expect((await db.query(`select estado_ppto from "ppto_Principal" where id = $1`, [idPpto])).rows[0].estado_ppto).toBe('EN_DESARROLLO');
    });

    it('con todo adjudicado, aprueba y las órdenes provisionales pasan a REGISTRADO', async () => {
      const res = await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c4, provA, '21', { adjudicar: true })).expect(201); // 3 × 7
      expect(res.body.compromisos.creados).toHaveLength(1);

      const provisionales = async () => (await db.query(`select count(*)::int as n from "documentosOrigen" where estado = 'PROVISIONAL' and id_centro_costo = $1`, [ccObra])).rows[0].n as number;
      const antes = await provisionales();
      expect(antes).toBeGreaterThanOrEqual(3);

      const ok = (await api().post('/presupuestos/E2E-PK-P1/aprobar').expect(200)).body;
      expect(ok).toMatchObject({ estado_ppto: 'APROBADO', documentos_cerrados: antes });
      expect(await provisionales()).toBe(0);

      const registrados = (await db.query(`select numero_documento, fecha_emision::date::text as fecha from "documentosOrigen" where estado = 'REGISTRADO' and id_centro_costo = $1`, [ccObra])).rows;
      expect(registrados).toHaveLength(antes);
      for (const d of registrados) expect(d.fecha).toBe(hoy); // nadie la había completado a mano: sigue siendo la del día
      for (const f of await furs(true)) {
        expect(f.estado).toBe('APROBADO');
        expect(f.origen).toBe('PPTO_ADJUDICACION');
        expect((await api().get(`/requerimientos/${f.id}`).expect(200)).body.provisional).toBe(false);
      }
      const panel = (await api().get(`/presupuestos/${idPpto}/compromisos`).expect(200)).body;
      expect(panel.compromisos.filter((c: { estado: string }) => c.estado !== 'ANULADO').every((c: { estado: string }) => c.estado === 'REGISTRADO')).toBe(true);
      expect(panel.items_sin_adjudicar).toEqual([]);
    });

    it('la orden registrada ya aparece en tesorería: se puede programar su pago', async () => {
      const oc = (await db.query(`select id, numero_documento from "documentosOrigen" where estado = 'REGISTRADO' and clase_documento = 'ORDEN_COMPRA' and id_centro_costo = $1 order by id limit 1`, [ccObra])).rows[0];
      const lista = (await api().get(`/administracion/documentos-origen?estado_pago=SIN_PROGRAMAR&pageSize=100`).expect(200)).body;
      expect(lista.data.some((d: { id: number }) => d.id === oc.id)).toBe(true);
      await api()
        .post('/tesoreria/programacion')
        .send({ items: [{ id_documento_origen: oc.id, fecha_programada: '2026-12-04', monto: '10', medio_pago: 'TRANSFERENCIA', urgente: true, observaciones: 'PRUEBA E2E' }] })
        .expect(201);
      expect((await api().get(`/almacen/recepciones/orden-compra/${oc.id}`).expect(200)).body.id).toBe(oc.id);
    });

    it('un presupuesto aprobado ya no admite cambiar sus ítems (409)', async () => {
      const cat = (await db.query(`select id_detalle_categoria as id from "ppto_DetalleItems" where id = $1`, [item1])).rows[0].id;
      await api().put(`/presupuestos/categorias-asignadas/${cat}/items`).send({ items: [] }).expect(409);
    });
  });

  // ─── Reasignar tras aprobar ─────────────────────────────────────────────────
  describe('si una orden registrada se anula, el ítem se puede reasignar y la orden nueva nace registrada (D-12)', () => {
    it('anular la orden y el FUR libera el ítem; adjudicar a otro proveedor genera un FUR y una orden REGISTRADO', async () => {
      // El FUR de la fase 2 es el único con el ítem 4.
      const idFur = (await db.query(`select r.id from requerimiento r join requerimiento_detalle d on d.id_requerimiento = r.id where d.id_ppto_item = $1 and r.estado = 'APROBADO'`, [item4])).rows[0].id;
      const oc = (await docs(idFur))[0];
      expect(oc.estado).toBe('REGISTRADO');
      await api().post(`/administracion/documentos-origen/${oc.id}/anular`).send({ motivo: 'PROVEEDOR NO CUMPLIO' }).expect(200);
      await api().post(`/requerimientos/${idFur}/anular`).send({}).expect(200);

      // El proveedor B cotiza el ítem 4 y gana: la orden nace directamente REGISTRADO (el presupuesto ya está aprobado).
      const res = await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c4, provB, '19.5', { adjudicar: true })).expect(201); // 3 × 6.50
      expect(res.body.compromisos.creados).toHaveLength(1);
      const nuevo = res.body.compromisos.creados[0];
      expect(nuevo.id_requerimiento).not.toBe(idFur);
      const nueva = (await docs(nuevo.id_requerimiento))[0];
      expect(nueva).toMatchObject({ estado: 'REGISTRADO', id_anexo: provB, monto: 19.5 });
      // Lo ya cerrado de la fase 1 no se tocó.
      expect((await furs(true)).length).toBe(2);
    });

    it('el ítem con orden registrada no se puede readjudicar (409)', async () => {
      await adjudicar(c1, null).expect(409);
      await adjudicar(c1, cotA).expect(200); // el mismo ganador no cambia nada
    });
  });
});
