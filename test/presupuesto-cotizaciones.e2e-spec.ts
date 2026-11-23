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
 * Cotizaciones por subpartida del presupuesto Meta y adjudicación (plan 09) contra la BD de DATABASE_URL: el proveedor cotiza UN total
 * por toda la subpartida, el sistema lo prorratea entre sus ítems según el costo Meta y la subpartida completa va a un solo proveedor.
 * Crea sus centros de costo (`E2E-PC-*`), presupuesto, proveedores y trabajador, y los elimina al final.
 */
describe('Presupuesto Meta: cotizaciones por subpartida y adjudicación (e2e)', () => {
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
  let idFase1 = 0; // fase con 2 subpartidas y 3 ítems
  let idFase2 = 0; // otra fase del mismo presupuesto
  let idFaseOtroPpto = 0;
  let c1 = 0; // subpartida 1 (ítems 1 y 2: 10 × S/ 5 = 50 y 2 × S/ 15 = 30 → costo Meta 80)
  let c2 = 0; // subpartida 2 (ítem 3: 4 × S/ 6)
  let c4 = 0; // subpartida de la fase 2 (ítem 4: 3 × S/ 8)
  let cCero = 0; // subpartida sin costo en el Meta (ítem 5: 2 × S/ 0)
  let cMixta = 0; // subpartida con un ítem sin cantidad (ítem 6: 0 × S/ 0) y otro con cantidad (ítem 7: 3 × S/ 9)
  let cOtro = 0; // subpartida de otro presupuesto
  let item1 = 0; // producto
  let item2 = 0; // servicio
  let item3 = 0;
  let item4 = 0;
  let item6 = 0;
  let item7 = 0;
  let cotA = 0; // proveedor A en c1
  let cotA2 = 0; // proveedor A en c2
  let cotB = 0; // proveedor B en c1

  const api = () => apiConSesion(app);
  const num = (v: string | number) => Number(v);
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
  const cuadro = async (idSub = c1) => (await api().get(`/presupuestos/${idPpto}/cuadro-comparativo?id_detalle_categoria=${idSub}`).expect(200)).body;
  const adjudicar = (idSub: number, idCotizacion: number | null, extra: Record<string, unknown> = {}) =>
    api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ id_detalle_categoria: idSub, id_cotizacion: idCotizacion, ...extra });
  const subDe = (item: number) => ({ [item1]: c1, [item2]: c1, [item3]: c2, [item4]: c4, [item6]: cMixta, [item7]: cMixta })[item] ?? c1;
  const ganador = async (item: number) => (await cuadro(subDe(item))).lineas.find((l: { id_ppto_item: number }) => l.id_ppto_item === item);

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
              `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "CostoTotalMeta", "Orden")
               values ($1, $2, $3, $4, $5, $6, $7, $7, $8) returning id`,
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
    const categoria = (await db.query(`select id from categoria order by id limit 1`)).rows[0].id as number;
    const r = await db.query(
      `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, $3, $4, $5) returning id`,
      [`ZZ-PC-${Math.random().toString(36).slice(2, 8)}`, `${tipo} DE PRUEBA COTIZACION`, categoria, unidad, tipo],
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
       values ('E2E-PC-C1', 'E2E-PC-F1', 'E2E PC MATERIALES'), ('E2E-PC-C2', 'E2E-PC-F1', 'E2E PC OTROS'),
              ('E2E-PC-C3', 'E2E-PC-F2', 'E2E PC SIN COSTO'), ('E2E-PC-C4', 'E2E-PC-F2', 'E2E PC MIXTA')`,
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
    [c1, c2] = f1.subfases;
    [item1, item2, item3] = f1.items;
    const f2 = await armar('E2E-PC-P1', ccObra, 'E2E-PC-F2', [
      { cat: 'E2E-PC-C1', items: [[producto, 3, 8]] },
      { cat: 'E2E-PC-C3', items: [[producto, 2, 0]] },
      { cat: 'E2E-PC-C4', items: [[producto, 0, 0], [producto, 3, 9]] },
    ]);
    idFase2 = f2.idFase;
    [c4, cCero, cMixta] = f2.subfases;
    [item4, , item6, item7] = f2.items;

    // Otro presupuesto del mismo centro de costo: sus subpartidas no se pueden cotizar desde el primero.
    idPptoOtro = await crearPpto('E2E-PC-P2', ccObra);
    const fo = await armar('E2E-PC-P2', ccObra, 'E2E-PC-F1', [{ cat: 'E2E-PC-C1', items: [[producto, 1, 1]] }]);
    idFaseOtroPpto = fo.idFase;
    [cOtro] = fo.subfases;
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
  describe('registrar la cotización de un proveedor para una subpartida', () => {
    it('registra el total de la subpartida y lo prorratea entre sus ítems según el costo Meta', async () => {
      const res = await api()
        .post(`/presupuestos/${idPpto}/cotizaciones`)
        .send(cuerpo(c1, provA, '72', { referencia: 'A-001', garantia: '12 MESES' }))
        .expect(201);
      cotA = res.body.id;
      expect(res.body.numero).toMatch(/^COT-\d{6}$/);
      expect(res.body).toMatchObject({
        id_presupuesto: idPpto,
        id_detalle_fase: idFase1,
        id_detalle_categoria: c1,
        subpartida: 'E2E PC MATERIALES',
        proveedor: 'E2E-PC Proveedor A',
        registrado_por: 'e2e-admin',
        prorrateada: true,
      });
      expect(num(res.body.total_global)).toBe(72);
      expect(num(res.body.total_sin_igv)).toBe(72);
      expect(num(res.body.igv)).toBe(12.96);
      expect(num(res.body.total)).toBe(84.96);
      expect(res.body.items_adjudicados).toBe(0);
      expect(res.body.protegida).toBe(false);
      // Pesos 50 y 30 sobre 80: al ítem 1 le tocan 45 (10 × 4.50) y al ítem 2, 27 (2 × 13.50).
      expect(res.body.lineas).toHaveLength(2);
      expect(res.body.lineas[0]).toMatchObject({ id_ppto_item: item1, cantidad_distinta: false, adjudicada: false, cotiza: true });
      expect(num(res.body.lineas[0].precio_unitario)).toBeCloseTo(4.5, 6);
      expect(num(res.body.lineas[0].subtotal_sin_igv)).toBe(45);
      expect(num(res.body.lineas[1].precio_unitario)).toBeCloseTo(13.5, 6);
      expect(num(res.body.lineas[1].subtotal_sin_igv)).toBe(27);
    });

    it('si el proveedor dio el total con IGV, se reparte tal cual y los totales salen bien', async () => {
      const res = await api()
        .post(`/presupuestos/${idPpto}/cotizaciones`)
        .send(cuerpo(c2, provA, '23.6', { incluye_igv: true }))
        .expect(201);
      cotA2 = res.body.id;
      expect(num(res.body.total_sin_igv)).toBe(20);
      expect(num(res.body.total)).toBe(23.6);
      expect(num(res.body.lineas[0].precio_unitario)).toBeCloseTo(5.9, 6); // 23.6 / 4, con IGV
      expect(num(res.body.lineas[0].precio_sin_igv)).toBe(5);
    });

    it('un proveedor solo cotiza una vez la subpartida (409), pero puede cotizar otra', async () => {
      await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c1, provA, '60')).expect(409);
      await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c4, provA, '24')).expect(201);
    });

    it('valida proveedor, subpartida y total (400)', async () => {
      const ruta = `/presupuestos/${idPpto}/cotizaciones`;
      await api().post(ruta).send(cuerpo(c1, noProveedor, '72')).expect(400); // no es un Proveedor
      await api().post(ruta).send(cuerpo(cOtro, provB, '72')).expect(400); // subpartida de otro presupuesto
      await api().post(ruta).send(cuerpo(999999999, provB, '72')).expect(400); // no existe
      await api().post(ruta).send(cuerpo(c1, provB, '0')).expect(400); // el total debe ser mayor a 0
      await api().post(ruta).send(cuerpo(c1, provB, '-5')).expect(400);
      const { total: _total, ...sinTotal } = cuerpo(c1, provB, '1');
      await api().post(ruta).send(sinTotal).expect(400); // el total es obligatorio
      const sinCosto = await api().post(ruta).send(cuerpo(cCero, provB, '10')).expect(400);
      expect(sinCosto.body.message).toMatch(/no tiene costo en el Meta/);
    });

    it('adjudicar exige un trabajador vinculado al usuario (409) y no deja la cotización a medias', async () => {
      const res = await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c1, provB, '70', { adjudicar: true })).expect(409);
      expect(res.body.message).toMatch(/trabajador vinculado/);
      const lista = (await api().get(`/presupuestos/${idPpto}/cotizaciones?id_detalle_categoria=${c1}`).expect(200)).body;
      expect(lista).toHaveLength(1); // la de B no quedó guardada
    });
  });

  // ─── Adjudicar ──────────────────────────────────────────────────────────────
  describe('adjudicación de la subpartida completa', () => {
    beforeAll(async () => {
      await db.query(`update usuarios set id_trabajador = $1 where "IdUsuario" = $2`, [trabajadorId, USUARIO_E2E]);
    });

    it('con la marca «adjudicar» el proveedor gana la subpartida completa, con quién y cuándo', async () => {
      const res = await api()
        .post(`/presupuestos/${idPpto}/cotizaciones`)
        .send(cuerpo(c1, provB, '70', { adjudicar: true, comentario_adjudicacion: 'MEJOR PRECIO' }))
        .expect(201);
      cotB = res.body.id;
      expect(res.body.items_adjudicados).toBe(2);
      expect(res.body.lineas.every((l: { adjudicada: boolean }) => l.adjudicada)).toBe(true);

      const c = await cuadro(c1);
      expect(c).toMatchObject({ items_total: 2, items_adjudicados: 2, id_cotizacion_ganadora: cotB });
      for (const l of c.lineas) {
        expect(l).toMatchObject({ id_cotizacion_ganadora: cotB, adjudicado_por: 'e2e-admin', comentario_adjudicacion: 'MEJOR PRECIO', cubierto: false });
        // Plan 09: al adjudicar ya nace el FUR aprobado y sus órdenes provisionales.
        expect(l.compromiso).toMatchObject({ estado_requerimiento: 'APROBADO', estado_documento: 'PROVISIONAL' });
        expect(l.ofertas).toHaveLength(2);
      }
      expect(res.body.compromisos.creados).toHaveLength(1);
      expect(res.body.compromisos.creados[0].documentos.map((d: { clase: string }) => d.clase).sort()).toEqual(['ORDEN_COMPRA', 'ORDEN_SERVICIO']);
    });

    it('el cuadro es de la subpartida, no sugiere ganador y resume un total por proveedor', async () => {
      const c = await cuadro(c1);
      expect(c).toMatchObject({
        id_presupuesto: idPpto,
        codigo_presupuesto: 'E2E-PC-P1',
        estado: 'EN_DESARROLLO',
        id_detalle_categoria: c1,
        subpartida: 'E2E PC MATERIALES',
        fase: 'E2E PC FASE 1',
        id_cotizacion_ganadora: cotB,
      });
      expect(c.proveedores).toHaveLength(2);
      const a = c.proveedores.find((p: { id_cotizacion: number }) => p.id_cotizacion === cotA);
      const b = c.proveedores.find((p: { id_cotizacion: number }) => p.id_cotizacion === cotB);
      expect(a).toMatchObject({ es_ganadora: false, items_ganados: 0 });
      expect(num(a.total_soles)).toBe(84.96);
      expect(b).toMatchObject({ es_ganadora: true, items_ganados: 2 });
      // El cuadro de otra subpartida no mezcla las cotizaciones de esta.
      expect((await cuadro(c2)).proveedores).toHaveLength(1);
    });

    it('PUT adjudicacion: cambia de ganador, repetir no cambia nada y quitar la libera', async () => {
      const r1 = (await adjudicar(c1, cotA, { comentario: 'DECISION DE OPERACIONES' }).expect(200)).body;
      expect(r1).toMatchObject({ adjudicados: 2, liberados: 0, sin_cambio: 0 });
      // A gana la subpartida (FUR nuevo con su OC y su OS); el FUR de B queda sin ítems y se anula.
      expect(r1.compromisos.creados).toHaveLength(1);
      expect(r1.compromisos.anulados).toHaveLength(1);
      expect((await cuadro(c1)).id_cotizacion_ganadora).toBe(cotA);

      const r2 = (await adjudicar(c1, cotA).expect(200)).body;
      expect(r2).toMatchObject({ adjudicados: 0, liberados: 0, sin_cambio: 2 });
      expect(r2.compromisos).toMatchObject({ creados: [], actualizados: [], anulados: [], sin_cambio: 1 });

      const r3 = (await adjudicar(c1, null).expect(200)).body;
      expect(r3).toMatchObject({ adjudicados: 0, liberados: 2 });
      expect(r3.compromisos.anulados).toHaveLength(1);
      const c = await cuadro(c1);
      expect(c).toMatchObject({ items_adjudicados: 0, id_cotizacion_ganadora: null });
      expect(await ganador(item1)).toMatchObject({ id_cot_detalle_ganadora: null, adjudicado_por: null, comentario_adjudicacion: null });
    });

    it('rechaza lo que no cuadra: cotización de otra subpartida, subpartida ajena o inexistente, o campos que faltan (400)', async () => {
      await adjudicar(c1, cotA2).expect(400); // la cotización es de otra subpartida
      await adjudicar(999999999, null).expect(400);
      await adjudicar(cOtro, null).expect(400); // subpartida de otro presupuesto
      await api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ id_detalle_categoria: c1 }).expect(400); // ausente no es lo mismo que null
      await api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ id_cotizacion: cotA }).expect(400);
    });

    it('un ítem sin cantidad queda fuera de la cotización y no impide adjudicar la subpartida', async () => {
      const res = await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(cMixta, provA, '27', { adjudicar: true })).expect(201);
      const sinCantidad = res.body.lineas.find((l: { id_ppto_item: number }) => l.id_ppto_item === item6);
      const conCantidad = res.body.lineas.find((l: { id_ppto_item: number }) => l.id_ppto_item === item7);
      expect(sinCantidad).toMatchObject({ cotiza: false, adjudicada: false });
      expect(conCantidad).toMatchObject({ cotiza: true, adjudicada: true });
      expect(num(conCantidad.precio_unitario)).toBeCloseTo(9, 6); // todo el total para el único ítem con cantidad
      expect(await cuadro(cMixta)).toMatchObject({ items_total: 2, items_adjudicados: 1, id_cotizacion_ganadora: res.body.id });
      expect((await ganador(item6)).id_cot_detalle_ganadora).toBeNull();
      await api().delete(`/presupuestos/${idPpto}/cotizaciones/${res.body.id}`).expect(200); // deja el estado como estaba
      expect((await cuadro(cMixta)).items_adjudicados).toBe(0);
    });
  });

  // ─── Editar y borrar ────────────────────────────────────────────────────────
  describe('editar y borrar conservan o sueltan el ganador', () => {
    beforeAll(async () => {
      await adjudicar(c1, cotA).expect(200);
    });

    it('editar el total vuelve a prorratear y conserva al ganador', async () => {
      const res = await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ total: '80' }).expect(200);
      expect(num(res.body.total_global)).toBe(80);
      expect(num(res.body.total_sin_igv)).toBe(80);
      expect(num(res.body.lineas[0].precio_unitario)).toBeCloseTo(5, 6); // 50 / 10
      expect(num(res.body.lineas[1].precio_unitario)).toBeCloseTo(15, 6); // 30 / 2
      expect(res.body.compromisos.actualizados).toHaveLength(1); // el FUR y sus órdenes provisionales toman los precios nuevos
      const l1 = await ganador(item1);
      expect(l1.id_cotizacion_ganadora).toBe(cotA);
      expect(l1.adjudicado_por).toBe('e2e-admin');
    });

    it('editar solo las condiciones no toca el total ni las líneas', async () => {
      const res = await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ forma_pago: 'Credito 30', dias_credito: 30 }).expect(200);
      expect(res.body).toMatchObject({ forma_pago: 'CREDITO 30', dias_credito: 30 });
      expect(num(res.body.total_sin_igv)).toBe(80);
      expect(num(res.body.lineas[0].precio_unitario)).toBeCloseTo(5, 6);
    });

    it('cambiar el IGV exige volver a enviar el total (400); con el total, se vuelve a repartir', async () => {
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ incluye_igv: true }).expect(400);
      const res = await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ incluye_igv: true, total: '94.4' }).expect(200);
      expect(num(res.body.total_sin_igv)).toBe(80);
      expect(num(res.body.total)).toBe(94.4);
      expect((await ganador(item1)).id_cotizacion_ganadora).toBe(cotA);
    });

    it('«adjudicar: false» suelta la subpartida solo si ese proveedor la ganaba', async () => {
      // B no la gana: pedir «no adjudicar» desde B no le quita el ganador a A.
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).send({ adjudicar: false }).expect(200);
      expect((await cuadro(c1)).id_cotizacion_ganadora).toBe(cotA);
      // A sí la gana: «adjudicar: false» desde A la suelta.
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ adjudicar: false }).expect(200);
      expect(await cuadro(c1)).toMatchObject({ items_adjudicados: 0, id_cotizacion_ganadora: null });
      await adjudicar(c1, cotA).expect(200);
    });

    it('si entra un ítem nuevo a la subpartida ganada, al volver a prorratear lo gana también (nunca queda a medias)', async () => {
      const nuevo = (
        await db.query(
          `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "CostoTotalMeta", "Orden")
           values ($1, 'E2E-PC-P1', $2, $3, 1, 10, 10, 10, 9) returning id`,
          [c1, producto, unidad],
        )
      ).rows[0].id as number;
      try {
        expect(await cuadro(c1)).toMatchObject({ items_total: 3, items_adjudicados: 2 });
        const res = await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ total: '90' }).expect(200);
        expect(res.body.lineas).toHaveLength(3);
        expect(await cuadro(c1)).toMatchObject({ items_total: 3, items_adjudicados: 3, id_cotizacion_ganadora: cotA });
      } finally {
        await db.query(`delete from "ppto_DetalleItems" where id = $1`, [nuevo]);
      }
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).send({ total: '80' }).expect(200);
      expect(await cuadro(c1)).toMatchObject({ items_total: 2, items_adjudicados: 2, id_cotizacion_ganadora: cotA });
    });

    it('eliminar la cotización ganadora deja la subpartida sin ganador', async () => {
      expect((await cuadro(c1)).id_cotizacion_ganadora).toBe(cotA);
      await api().delete(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).expect(200);
      expect(await cuadro(c1)).toMatchObject({ items_adjudicados: 0, id_cotizacion_ganadora: null });
      await api().get(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).expect(404);
      await api().delete(`/presupuestos/${idPpto}/cotizaciones/${cotA}`).expect(404);
    });
  });

  // ─── Ítems del presupuesto ──────────────────────────────────────────────────
  describe('ítems de la partida', () => {
    beforeAll(async () => {
      // Deja a B como ganador de la subpartida para ver cómo viaja al diálogo de ítems.
      await adjudicar(c1, cotB).expect(200);
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
      expect(num(i1.cotizacion.adjudicado.precio_sin_igv)).toBeCloseTo(4.375, 3); // 70 × 50/80 ÷ 10
      // La subpartida va completa a B: el ítem 2 también.
      expect(i2.cotizacion).toMatchObject({ cotizaciones: 1 });
      expect(i2.cotizacion.adjudicado).toMatchObject({ id_cotizacion: cotB });
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

    it('si un ítem cambia de producto pierde el ganador y la subpartida se readjudica completa', async () => {
      const otroProducto = await crearProducto('PRODUCTO');
      try {
        const base = comoEnvio(await items());
        await api().put(`/presupuestos/categorias-asignadas/${c1}/items`).send({ items: base.map((i) => (i.id === item1 ? { ...i, id_producto: otroProducto } : i)) }).expect(200);
        expect(await ganador(item1)).toMatchObject({ id_cot_detalle_ganadora: null, adjudicado_por: null });
        expect((await cuadro(c1)).items_adjudicados).toBe(1); // el ítem 2 conserva a B hasta que se readjudique
        await api().put(`/presupuestos/categorias-asignadas/${c1}/items`).send({ items: base }).expect(200);
        await adjudicar(c1, cotB).expect(200); // readjudicar la subpartida completa la deja otra vez entera
        expect((await cuadro(c1)).items_adjudicados).toBe(2);
      } finally {
        await db.query(`delete from producto where id = $1`, [otroProducto]);
      }
    });
  });

  // ─── Ítem cubierto por una orden registrada ─────────────────────────────────
  describe('una subpartida con una orden registrada no cambia de proveedor', () => {
    let idFur = 0;
    let idDo = 0;
    let numeroDo = '';

    beforeAll(async () => {
      // Ya hay un FUR y órdenes provisionales (los generó el sistema): se simula el cierre que hace la aprobación del presupuesto.
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
      await adjudicar(c1, null).expect(409);
      await adjudicar(c1, cotB).expect(200); // el mismo ganador no cambia nada
      const res = await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).send({ referencia: 'X' }).expect(409);
      expect(res.body.message).toContain(numeroDo);
      await api().delete(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).expect(409);
    });

    it('si la orden y su FUR se anulan, la subpartida vuelve a ser libre', async () => {
      // Como en Administración: se anulan las órdenes del FUR y luego el FUR (la conciliación genera uno nuevo para el ganador).
      await db.query(`update "documentosOrigen" set estado = 'ANULADO' where id_requerimiento = $1`, [idFur]);
      await db.query(`update requerimiento set estado = 'ANULADO' where id = $1`, [idFur]);
      expect((await ganador(item1)).cubierto).toBe(false);
      await api().patch(`/presupuestos/${idPpto}/cotizaciones/${cotB}`).send({ referencia: 'B-001' }).expect(200);
    });
  });

  // ─── Presupuesto aprobado ───────────────────────────────────────────────────
  describe('según el estado del presupuesto', () => {
    it('presupuesto aprobado: no se cambian los ítems (409) y se cotizan solo subpartidas sin orden registrada', async () => {
      await db.query(`update "ppto_Principal" set estado_ppto = 'APROBADO' where id = $1`, [idPpto]);
      const res = await api()
        .put(`/presupuestos/categorias-asignadas/${c1}/items`)
        .send({ items: [{ id: item1, id_producto: producto, id_unidad_medida: unidad, Cantidad: 10, CostoUnitario: 5, PrecioVenta: 0 }] })
        .expect(409);
      expect(res.body.message).toMatch(/nueva versión|presupuesto adicional/);
      // Sin orden registrada en esa subpartida, el proveedor todavía puede cambiarse (D-12).
      await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(c2, provB, '20')).expect(201);
    });

    it.each(['ENTREGADO', 'LIQUIDADO', 'ANULADO'])('presupuesto %s: ya no admite cotizaciones (409)', async (estado) => {
      await db.query(`update "ppto_Principal" set estado_ppto = $2 where id = $1`, [idPpto, estado]);
      await api().post(`/presupuestos/${idPpto}/cotizaciones`).send(cuerpo(cMixta, provB, '27')).expect(409);
      await adjudicar(c4, null).expect(409);
    });

    it('un presupuesto inexistente devuelve 404 y el cuadro exige una subpartida del presupuesto (400)', async () => {
      await api().get('/presupuestos/999999999/cotizaciones').expect(404);
      await api().get(`/presupuestos/${idPpto}/cuadro-comparativo?id_detalle_categoria=${cOtro}`).expect(400);
      await api().get(`/presupuestos/${idPpto}/cuadro-comparativo`).expect(400); // la subpartida es obligatoria
      expect(idFase2).toBeGreaterThan(0);
      expect(idFaseOtroPpto).toBeGreaterThan(0);
      expect(idPptoOtro).toBeGreaterThan(0);
      expect(cCero).toBeGreaterThan(0);
    });
  });
});
