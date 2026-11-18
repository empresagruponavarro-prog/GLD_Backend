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
 * Cotizaciones por ítem del presupuesto Meta y adjudicación (plan 09, F2) contra la BD de DATABASE_URL.
 * Crea sus centros de costo (`E2E-PC-*`), presupuesto, proveedores y trabajador, y los elimina al final.
 */
describe('Presupuesto Meta: cotizaciones por ítem y adjudicación (e2e)', () => {
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
  let noProveedor = 0;
  let trabajadorId = 0;
  let idPpto = 0;
  let idPptoOtro = 0;
  let idFase1 = 0; // fase con 3 ítems
  let idFase2 = 0; // otra fase del mismo presupuesto
  let idFaseOtroPpto = 0;
  let c1 = 0; // subfase 1 (ítems 1 y 2)
  let item1 = 0; // producto, 10 × S/ 5
  let item2 = 0; // servicio, 2 × S/ 15
  let item3 = 0; // producto, 4 × S/ 6
  let item4 = 0; // ítem de la fase 2
  let cotA = 0;
  let cotB = 0;

  const api = () => apiConSesion(app);
  const num = (v: string | number) => Number(v);
  const redondear2 = (n: number) => Math.round(n * 100) / 100;

  const cuerpo = (idFase: number, idProveedor: number, lineas: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({
    id_detalle_fase: idFase,
    id_proveedor: idProveedor,
    fecha: hoy,
    moneda_id: 'PEN',
    moneda_simbolo: 'S/',
    forma_pago: 'Contado',
    ...extra,
    lineas,
  });
  const linea = (id_ppto_item: number, cantidad: string, precio_unitario: string, extra: Record<string, unknown> = {}) => ({
    id_ppto_item,
    cantidad,
    precio_unitario,
    ...extra,
  });
  const cuadro = async (idFase = idFase1) => (await api().get(`/presupuestos/${idPpto}/cuadro-comparativo?id_detalle_fase=${idFase}`).expect(200)).body;
  const ganador = async (item: number) => (await cuadro()).lineas.find((l: { id_ppto_item: number }) => l.id_ppto_item === item);

  /** Arma fases, categorías e ítems de un presupuesto ya creado (mismo patrón de `subfase-gasto.e2e-spec.ts`). */
  const armar = async (codigo: string, idCc: number, fase: string, cats: Array<{ cat: string; items: Array<[number, number, number]> }>) => {
    const idDetalle = `E2E-PC-DF-${codigo}-${fase}`;
    const costoCats = cats.map((c) => redondear2(c.items.reduce((a, [, q, p]) => a + redondear2(q * p), 0)));
    const idFase = (
      await db.query(
        `insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase", "CostoDirecto") values ($1, $2, $3, $4, $5) returning id`,
        [idDetalle, codigo, idCc, fase, redondear2(costoCats.reduce((a, b) => a + b, 0))],
      )
    ).rows[0].id as number;
    const subfases: number[] = [];
    const items: number[] = [];
    for (const [j, c] of cats.entries()) {
      const id = (
        await db.query(
          `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria", "CostoDirecto")
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [`E2E-PC-DC-${codigo}-${fase}-${j}`, codigo, idDetalle, idCc, fase, c.cat, costoCats[j]],
        )
      ).rows[0].id as number;
      subfases.push(id);
      for (const [k, [idProd, q, p]] of c.items.entries()) {
        items.push(
          (
            await db.query(
              `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "Orden")
               values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
              [id, codigo, idProd, unidad, q, p, redondear2(q * p), k],
            )
          ).rows[0].id as number,
        );
      }
    }
    return { idFase, subfases, items };
  };

  const crearPpto = async (codigo: string, idCc: number) =>
    (await api().post('/presupuestos').send({ IdPresupuesto: codigo, id_centro_costo: idCc, TipoPpto: 'Principal', Proyecto: 'E2E PC', Estado: 'PENDIENTE' }).expect(201)).body.id as number;

  async function crearProducto(tipo: 'PRODUCTO' | 'SERVICIO'): Promise<number> {
    const r = await db.query(
      `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, 1, 1, $3) returning id`,
      [`ZZ-PC-${Math.random().toString(36).slice(2, 8)}`, `${tipo} DE PRUEBA COTIZACION`, tipo],
    );
    return r.rows[0].id;
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
    provA = await anexo('Proveedor', 'E2E-PC Proveedor A');
    provB = await anexo('Proveedor', 'E2E-PC Proveedor B');
    noProveedor = await anexo('Cliente', 'E2E-PC Cliente');
    trabajadorId = await anexo('Trabajador', 'E2E-PC Trabajador');
    await db.query(`insert into trabajador (id_anexo) values ($1)`, [trabajadorId]);

    ccObra = (
      await db.query(
        `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ('E2E-PC-OBRA', 'ABIERTO', $1, $2, 2026, $3) returning id`,
        [inicio, fin, noProveedor],
      )
    ).rows[0].id;

    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-PC-F1', 'E2E PC FASE 1'), ('E2E-PC-F2', 'E2E PC FASE 2')`);
    await db.query(
      `insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion")
       values ('E2E-PC-C1', 'E2E-PC-F1', 'E2E PC MATERIALES'), ('E2E-PC-C2', 'E2E-PC-F1', 'E2E PC OTROS')`,
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    idPpto = await crearPpto('E2E-PC-P1', ccObra);
    const f1 = await armar('E2E-PC-P1', ccObra, 'E2E-PC-F1', [
      { cat: 'E2E-PC-C1', items: [[producto, 10, 5], [servicio, 2, 15]] },
      { cat: 'E2E-PC-C2', items: [[producto, 4, 6]] },
    ]);
    idFase1 = f1.idFase;
    [c1] = f1.subfases;
    [item1, item2, item3] = f1.items;
    const f2 = await armar('E2E-PC-P1', ccObra, 'E2E-PC-F2', [{ cat: 'E2E-PC-C1', items: [[producto, 3, 8]] }]);
    idFase2 = f2.idFase;
    [item4] = f2.items;

    // Otro presupuesto del mismo centro de costo: sus fases no se pueden cotizar desde el primero.
    idPptoOtro = await crearPpto('E2E-PC-P2', ccObra);
    idFaseOtroPpto = (await armar('E2E-PC-P2', ccObra, 'E2E-PC-F1', [{ cat: 'E2E-PC-C1', items: [[producto, 1, 1]] }])).idFase;
  });

  afterAll(async () => {
    if (db) {
      const ccs = `(select id from "CentroCostos" where centro_costo like 'E2E-PC-%')`;
      await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "documentosOrigen" where id_centro_costo in ${ccs}`);
      await db.query(`update requerimiento set id_cotizacion_ganadora = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from cotizacion where id_requerimiento in (select id from requerimiento where id_centro_costo in ${ccs})`);
      await db.query(`delete from requerimiento where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal_Historial" where "IdPresupuesto" in (select "IdPresupuesto" from "ppto_Principal" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-PC-%'`);
      await db.query(`delete from "ppto_FasesCategorias" where "IdpptoFaseCategoria" like 'E2E-PC-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-PC-%'`);
      await borrarUsuarioE2E(db);
      await db.query(`delete from trabajador where id_anexo in (select id from anexos where "Anexo" like 'E2E-PC %')`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-PC %'`);
      await db.query(`delete from producto where id = any($1)`, [[producto, servicio].filter(Boolean)]);
      await db.end();
    }
    await app?.close();
  });

  // ─── Registrar ──────────────────────────────────────────────────────────────
  describe('registrar la cotización de un proveedor para una fase', () => {
    it('registra con sus líneas y calcula los totales sin y con IGV', async () => {
      const res = await api()
        .post(`/presupuestos/${idPpto}/cotizaciones`)
        .send(cuerpo(idFase1, provA, [linea(item1, '10', '5'), linea(item2, '2', '20'), linea(item3, '4', '5')], { referencia: 'A-001', garantia: '12 MESES' }))
        .expect(201);
      cotA = res.body.id;
      expect(res.body.numero).toMatch(/^COT-\d{6}$/);
      expect(res.body).toMatchObject({ id_presupuesto: idPpto, id_detalle_fase: idFase1, proveedor: 'E2E-PC Proveedor A', registrado_por: 'e2e-admin' });
      expect(num(res.body.total_sin_igv)).toBe(110);
      expect(num(res.body.igv)).toBe(19.8);
      expect(num(res.body.total)).toBe(129.8);
      expect(res.body.items_adjudicados).toBe(0);
      expect(res.body.protegida).toBe(false);
      expect(res.body.lineas).toHaveLength(3);
      expect(res.body.lineas[0]).toMatchObject({ id_ppto_item: item1, subfase: 'E2E PC MATERIALES', cantidad_distinta: false, adjudicada: false });
      expect(num(res.body.lineas[0].cantidad_item)).toBe(10);
    });

    it('un proveedor solo cotiza una vez la fase (409), pero puede cotizar otra', async () => {
      await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(idFase1, provA, [linea(item1, '10', '4')])).expect(409);
      await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(idFase2, provA, [linea(item4, '3', '7')])).expect(201);
    });

    it('valida proveedor, fase, ítems y cantidades (400)', async () => {
      const ruta = `/presupuestos/${idPpto}/cotizaciones`;
      await api().post(ruta).send(cuerpo(idFase1, noProveedor, [linea(item1, '10', '5')])).expect(400); // no es un Proveedor
      await api().post(ruta).send(cuerpo(idFaseOtroPpto, provB, [linea(item1, '10', '5')])).expect(400); // fase de otro presupuesto
      await api().post(ruta).send(cuerpo(idFase1, provB, [linea(item4, '3', '5')])).expect(400); // ítem de otra fase
      await api().post(ruta).send(cuerpo(idFase1, provB, [linea(item1, '11', '5')])).expect(400); // más que el presupuesto
      await api().post(ruta).send(cuerpo(idFase1, provB, [linea(item1, '0', '5')])).expect(400);
      await api().post(ruta).send(cuerpo(idFase1, provB, [linea(item1, '5', '5'), linea(item1, '5', '5')])).expect(400); // repetido
      await api().post(ruta).send(cuerpo(idFase1, provB, [linea(item1, '10', '5', { cotiza: false })])).expect(400); // nada que ofrecer
      await api().post(ruta).send({ ...cuerpo(idFase1, provB, []), lineas: [] }).expect(400);
    });

    it('adjudicar exige un trabajador vinculado al usuario (409) y no deja la cotización a medias', async () => {
      const res = await api()
        .post(`/presupuestos/${idPpto}/cotizaciones`)
        .send(cuerpo(idFase1, provB, [linea(item1, '10', '4', { adjudicar: true })]))
        .expect(409);
      expect(res.body.message).toMatch(/trabajador vinculado/);
      const lista = (await api().get(`/presupuestos/${idPpto}/cotizaciones?id_detalle_fase=${idFase1}`).expect(200)).body;
      expect(lista).toHaveLength(1); // la de B no quedó guardada
    });
  });

  // ─── Adjudicar ──────────────────────────────────────────────────────────────
  describe('adjudicación por ítem', () => {
    beforeAll(async () => {
      await db.query(`update usuarios set id_trabajador = $1 where "IdUsuario" = $2`, [trabajadorId, USUARIO_E2E]);
    });

    it('con la marca «adjudicar» el proveedor gana el ítem, con quién y cuándo', async () => {
      const res = await api()
        .post(`/presupuestos/${idPpto}/cotizaciones`)
        .send(cuerpo(idFase1, provB, [linea(item1, '10', '4', { adjudicar: true }), linea(item2, '2', '25')], { comentario_adjudicacion: 'MEJOR PRECIO' }))
        .expect(201);
      cotB = res.body.id;
      expect(res.body.items_adjudicados).toBe(1);
      expect(res.body.lineas.find((l: { id_ppto_item: number }) => l.id_ppto_item === item1).adjudicada).toBe(true);

      const l1 = await ganador(item1);
      expect(l1).toMatchObject({ id_cotizacion_ganadora: cotB, adjudicado_por: 'e2e-admin', comentario_adjudicacion: 'MEJOR PRECIO', cubierto: false });
      // Plan 09: al adjudicar ya nace el FUR aprobado y su orden de compra provisional.
      expect(l1.compromiso).toMatchObject({ estado_requerimiento: 'APROBADO', estado_documento: 'PROVISIONAL' });
      expect(res.body.compromisos.creados).toHaveLength(1);
      expect(res.body.compromisos.creados[0].documentos.map((d: { clase: string }) => d.clase)).toEqual(['ORDEN_COMPRA']);
      expect(l1.ofertas).toHaveLength(2);
      expect(l1.ofertas.every((o: { cantidad_completa: boolean }) => o.cantidad_completa)).toBe(true);
    });

    it('el cuadro no sugiere ganador y resume la fase en soles', async () => {
      const c = await cuadro();
      expect(c).toMatchObject({ id_presupuesto: idPpto, codigo_presupuesto: 'E2E-PC-P1', estado: 'EN_DESARROLLO', fase: 'E2E PC FASE 1', items_total: 3, items_adjudicados: 1 });
      expect(c.proveedores).toHaveLength(2);
      const a = c.proveedores.find((p: { id_cotizacion: number }) => p.id_cotizacion === cotA);
      expect(num(a.total_soles)).toBe(129.8);
      expect(a.items_ganados).toBe(0);
      expect(c.proveedores.find((p: { id_cotizacion: number }) => p.id_cotizacion === cotB).items_ganados).toBe(1);
      for (const p of c.proveedores) expect(p).not.toHaveProperty('es_ganadora');
    });

    it('PUT adjudicacion: elige varios ítems, cambia de ganador y quita uno', async () => {
      const lineaDe = async (item: number, cot: number) =>
        (await ganador(item)).ofertas.find((o: { id_cotizacion: number }) => o.id_cotizacion === cot).id_cot_detalle as number;

      const r1 = (
        await api()
          .put(`/presupuestos/${idPpto}/adjudicacion`)
          .send({
            items: [
              { id_ppto_item: item1, id_cot_detalle: await lineaDe(item1, cotA) }, // cambia de B a A
              { id_ppto_item: item2, id_cot_detalle: await lineaDe(item2, cotB) },
              { id_ppto_item: item3, id_cot_detalle: await lineaDe(item3, cotA) },
            ],
            comentario: 'DECISION DE OPERACIONES',
          })
          .expect(200)
      ).body;
      expect(r1).toMatchObject({ adjudicados: 3, liberados: 0, sin_cambio: 0 });
      // A pasa a ganar los bienes (FUR nuevo); B se queda con el servicio (su FUR se actualiza: la OC pasa a ser OS).
      expect(r1.compromisos.creados).toHaveLength(1);
      expect(r1.compromisos.actualizados).toHaveLength(1);
      expect(r1.compromisos.actualizados[0].documentos.map((d: { clase: string }) => d.clase)).toEqual(['ORDEN_SERVICIO']);
      expect((await ganador(item1)).id_cotizacion_ganadora).toBe(cotA);
      expect((await ganador(item2)).id_cotizacion_ganadora).toBe(cotB);

      // Repetir lo mismo no cambia nada; quitar uno lo libera.
      const r2 = (
        await api()
          .put(`/presupuestos/${idPpto}/adjudicacion`)
          .send({ items: [{ id_ppto_item: item1, id_cot_detalle: await lineaDe(item1, cotA) }, { id_ppto_item: item3, id_cot_detalle: null }] })
          .expect(200)
      ).body;
      expect(r2).toMatchObject({ adjudicados: 0, liberados: 1, sin_cambio: 1 });
      expect(r2.compromisos.actualizados).toHaveLength(1); // el FUR de A pierde el ítem 3
      const l3 = await ganador(item3);
      expect(l3).toMatchObject({ id_cot_detalle_ganadora: null, adjudicado_por: null, comentario_adjudicacion: null });
      expect((await cuadro()).items_adjudicados).toBe(2);
    });

    it('rechaza lo que no cuadra: oferta de otro ítem, cantidad menor, ítem repetido o sin id_cot_detalle (400)', async () => {
      const ofertaItem1A = (await ganador(item1)).ofertas.find((o: { id_cotizacion: number }) => o.id_cotizacion === cotA).id_cot_detalle as number;
      const ruta = `/presupuestos/${idPpto}/adjudicacion`;
      await api().put(ruta).send({ items: [{ id_ppto_item: item2, id_cot_detalle: ofertaItem1A }] }).expect(400); // la oferta es de otro ítem
      await api().put(ruta).send({ items: [{ id_ppto_item: 999999999, id_cot_detalle: null }] }).expect(400);
      await api().put(ruta).send({ items: [{ id_ppto_item: item1, id_cot_detalle: null }, { id_ppto_item: item1, id_cot_detalle: null }] }).expect(400);
      await api().put(ruta).send({ items: [{ id_ppto_item: item1 }] }).expect(400); // ausente no es lo mismo que null
      await api().put(ruta).send({ items: [] }).expect(400);
    });

    it('respuesta 5: un proveedor que cotiza menos cantidad no gana el ítem (400)', async () => {
      const cot = (
        await api()
          .post(`/presupuestos/${idPptoOtro}/cotizaciones`)
          .send(cuerpo(idFaseOtroPpto, provA, [linea((await db.query(`select id from "ppto_DetalleItems" where "IdPresupuesto" = 'E2E-PC-P2'`)).rows[0].id, '0.5', '1')]))
          .expect(201)
      ).body;
      const res = await api()
        .put(`/presupuestos/${idPptoOtro}/adjudicacion`)
        .send({ items: [{ id_ppto_item: cot.lineas[0].id_ppto_item, id_cot_detalle: cot.lineas[0].id }] })
        .expect(400);
      expect(res.body.message).toMatch(/completo a un solo proveedor/);
    });
  });

  // ─── Editar y borrar ────────────────────────────────────────────────────────
  describe('editar y borrar conservan o sueltan el ganador', () => {
    it('editar el precio de la línea ganadora conserva al ganador', async () => {
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ lineas: [linea(item1, '10', '4.5'), linea(item2, '2', '20'), linea(item3, '4', '5')] }).expect(200);
      const l1 = await ganador(item1);
      expect(l1.id_cotizacion_ganadora).toBe(cotA);
      expect(l1.adjudicado_por).toBe('e2e-admin');
    });

    it('si la línea ganadora deja de cotizar la cantidad completa, el ítem pierde el ganador', async () => {
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ lineas: [linea(item1, '8', '4.5'), linea(item2, '2', '20'), linea(item3, '4', '5')] }).expect(200);
      expect(await ganador(item1)).toMatchObject({ id_cot_detalle_ganadora: null, adjudicado_por: null });
      // Vuelve a ofrecerlo completo y lo gana de nuevo con la marca.
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ lineas: [linea(item1, '10', '4.5', { adjudicar: true }), linea(item2, '2', '20'), linea(item3, '4', '5')] }).expect(200);
      expect((await ganador(item1)).id_cotizacion_ganadora).toBe(cotA);
    });

    it('«adjudicar: false» suelta el ítem solo si ese proveedor lo ganaba', async () => {
      // item2 lo gana B: pedirlo «no adjudicar» desde A no le quita el ganador a B.
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ lineas: [linea(item1, '10', '4.5'), linea(item2, '2', '20', { adjudicar: false }), linea(item3, '4', '5')] }).expect(200);
      expect((await ganador(item2)).id_cotizacion_ganadora).toBe(cotB);
      // item1 lo gana A: «adjudicar: false» desde A sí lo suelta.
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ lineas: [linea(item1, '10', '4.5', { adjudicar: false }), linea(item2, '2', '20'), linea(item3, '4', '5')] }).expect(200);
      expect((await ganador(item1)).id_cot_detalle_ganadora).toBeNull();
      await api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ items: [{ id_ppto_item: item1, id_cot_detalle: (await ganador(item1)).ofertas.find((o: { id_cotizacion: number }) => o.id_cotizacion === cotA).id_cot_detalle }] }).expect(200);
    });

    it('quitar una línea de la cotización libera el ítem que ganaba', async () => {
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).send({ lineas: [linea(item1, '10', '4')] }).expect(200);
      expect(await ganador(item2)).toMatchObject({ id_cot_detalle_ganadora: null, adjudicado_por: null });
      const lista = (await api().get(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).expect(200)).body;
      expect(lista.lineas).toHaveLength(1);
    });

    it('eliminar la cotización ganadora deja sus ítems sin ganador', async () => {
      expect((await ganador(item1)).id_cotizacion_ganadora).toBe(cotA);
      await api().delete(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).expect(200);
      expect(await ganador(item1)).toMatchObject({ id_cot_detalle_ganadora: null, adjudicado_por: null });
      await api().get(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).expect(404);
      await api().delete(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).expect(404);
    });
  });

  // ─── Ítems del presupuesto ──────────────────────────────────────────────────
  describe('ítems de la partida', () => {
    beforeAll(async () => {
      // Deja un ganador en el ítem 1 para ver cómo viaja al diálogo de ítems.
      const oferta = (await ganador(item1)).ofertas.find((o: { id_cotizacion: number }) => o.id_cotizacion === cotB).id_cot_detalle;
      await api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ items: [{ id_ppto_item: item1, id_cot_detalle: oferta }] }).expect(200);
    });

    const items = async () => (await api().get(`/presupuestos/categorias-asignadas/${c1}/items`).expect(200)).body;
    const comoEnvio = (r: { items: Array<Record<string, unknown>> }) =>
      r.items.map((i) => ({ id: i['id'], id_producto: i['id_producto'], id_unidad_medida: i['id_unidad_medida'], Cantidad: i['Cantidad'], CostoUnitario: i['CostoUnitario'], PrecioVenta: i['PrecioVenta'], Item: i['Item'] }));

    it('cada ítem trae cuántas cotizaciones tiene, quién gana y su compromiso', async () => {
      const r = await items();
      const i1 = r.items.find((i: { id: number }) => i.id === item1);
      const i2 = r.items.find((i: { id: number }) => i.id === item2);
      expect(i1.cotizacion).toMatchObject({ cotizaciones: 1, cubierto: false });
      expect(i1.cotizacion.compromiso).toMatchObject({ estado_requerimiento: 'APROBADO', estado_documento: 'PROVISIONAL' });
      expect(i1.cotizacion.adjudicado).toMatchObject({ id_cotizacion: cotB, proveedor: 'E2E-PC Proveedor B', adjudicado_por: 'e2e-admin' });
      expect(num(i1.cotizacion.adjudicado.precio_sin_igv)).toBe(4);
      expect(i2.cotizacion).toMatchObject({ cotizaciones: 0, adjudicado: null });
    });

    it('guardar los ítems con el mismo id conserva el ganador, aunque cambie la cantidad (D-14)', async () => {
      const base = comoEnvio(await items());
      await api().put(`/presupuestos/categorias-asignadas/${c1}/items`).send({ items: base.map((i) => (i.id === item1 ? { ...i, Cantidad: 12 } : i)) }).expect(200);
      const i1 = (await items()).items.find((i: { id: number }) => i.id === item1);
      expect(num(i1.Cantidad)).toBe(12);
      expect(i1.cotizacion.adjudicado.id_cotizacion).toBe(cotB);
      // El cuadro avisa que la cantidad cotizada (10) ya no coincide con la del ítem (12).
      expect((await ganador(item1)).cantidad_distinta).toBe(true);
      await api().put(`/presupuestos/categorias-asignadas/${c1}/items`).send({ items: base }).expect(200); // vuelve a 10
      expect((await ganador(item1)).cantidad_distinta).toBe(false);
    });

    it('si el ítem cambia de producto pierde el ganador', async () => {
      const otroProducto = await crearProducto('PRODUCTO');
      try {
        const base = comoEnvio(await items());
        await api().put(`/presupuestos/categorias-asignadas/${c1}/items`).send({ items: base.map((i) => (i.id === item1 ? { ...i, id_producto: otroProducto } : i)) }).expect(200);
        expect(await ganador(item1)).toMatchObject({ id_cot_detalle_ganadora: null, adjudicado_por: null });
        await api().put(`/presupuestos/categorias-asignadas/${c1}/items`).send({ items: base }).expect(200);
      } finally {
        await db.query(`delete from producto where id = $1`, [otroProducto]);
      }
    });
  });

  // ─── Ítem cubierto por una orden registrada ─────────────────────────────────
  describe('un ítem con una orden registrada no cambia de proveedor', () => {
    let idFur = 0;
    let idDo = 0;
    let numeroDo = '';

    beforeAll(async () => {
      // Ya hay un FUR y una orden provisional (los generó el sistema): se simula el cierre que hace la aprobación del presupuesto.
      const oferta = (await ganador(item1)).ofertas.find((o: { id_cotizacion: number }) => o.id_cotizacion === cotB).id_cot_detalle;
      await api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ items: [{ id_ppto_item: item1, id_cot_detalle: oferta }] }).expect(200);
      const compromiso = (await ganador(item1)).compromiso;
      idFur = compromiso.id_requerimiento;
      idDo = compromiso.id_documento;
      numeroDo = compromiso.numero_documento;
      await db.query(`update "documentosOrigen" set estado = 'REGISTRADO' where id = $1`, [idDo]);
    });

    it('el cuadro muestra el FUR y la orden, y marca el ítem como cubierto', async () => {
      const l1 = await ganador(item1);
      expect(l1.cubierto).toBe(true);
      expect(l1.compromiso).toMatchObject({ id_requerimiento: idFur, estado_requerimiento: 'APROBADO', id_documento: idDo, numero_documento: numeroDo, estado_documento: 'REGISTRADO' });
      const r = (await api().get(`/presupuestos/categorias-asignadas/${c1}/items`).expect(200)).body.items.find((i: { id: number }) => i.id === item1);
      expect(r.cotizacion).toMatchObject({ cubierto: true });
      expect((await api().get(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).expect(200)).body.protegida).toBe(true);
    });

    it('no se cambia ni se quita el ganador (409) ni se edita o elimina su cotización (409)', async () => {
      await api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ items: [{ id_ppto_item: item1, id_cot_detalle: null }] }).expect(409);
      const res = await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).send({ referencia: 'X' }).expect(409);
      expect(res.body.message).toContain(numeroDo);
      await api().delete(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).expect(409);
    });

    it('si la orden se anula, el ítem vuelve a ser libre', async () => {
      await db.query(`update "documentosOrigen" set estado = 'ANULADO' where id = $1`, [idDo]);
      expect((await ganador(item1)).cubierto).toBe(false);
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).send({ referencia: 'B-001' }).expect(200);
    });
  });

  // ─── Presupuesto aprobado ───────────────────────────────────────────────────
  describe('según el estado del presupuesto', () => {
    it('presupuesto aprobado: no se cambian los ítems (409) y las cotizaciones solo de ítems sin orden', async () => {
      await db.query(`update "ppto_Principal" set estado_ppto = 'APROBADO' where id = $1`, [idPpto]);
      const res = await api()
        .put(`/presupuestos/categorias-asignadas/${c1}/items`)
        .send({ items: [{ id: item1, id_producto: producto, id_unidad_medida: unidad, Cantidad: 10, CostoUnitario: 5, PrecioVenta: 0 }] })
        .expect(409);
      expect(res.body.message).toMatch(/nueva versión|presupuesto adicional/);
      // Sin orden registrada, el proveedor del ítem 2 todavía puede cambiarse (D-12).
      await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(idFase1, provA, [linea(item2, '2', '10')])).expect(201);
    });

    it.each(['ENTREGADO', 'LIQUIDADO', 'ANULADO'])('presupuesto %s: ya no admite cotizaciones (409)', async (estado) => {
      await db.query(`update "ppto_Principal" set estado_ppto = $2 where id = $1`, [idPpto, estado]);
      await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(idFase2, provB, [linea(item4, '3', '7')])).expect(409);
      await api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ items: [{ id_ppto_item: item4, id_cot_detalle: null }] }).expect(409);
    });

    it('un presupuesto inexistente devuelve 404', async () => {
      await api().get('/presupuestos/999999999/cotizaciones').expect(404);
      await api().get(`/presupuestos/${idPpto}/cuadro-comparativo?id_detalle_fase=${idFaseOtroPpto}`).expect(400);
      await api().get(`/presupuestos/${idPpto}/cuadro-comparativo`).expect(400); // la fase es obligatoria
    });
  });
});
