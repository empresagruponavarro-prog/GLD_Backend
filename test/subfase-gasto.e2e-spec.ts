import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { aDia, deDia, lunesDe } from '../src/features/operaciones-obra/shared/control-avance/calendario.js';
import { hoyLima } from '../src/features/operaciones-obra/shared/obra-shared.js';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Subfase en compras y almacén, y gasto por subfase (GRP F6) contra la BD de DATABASE_URL.
 * Crea sus centros de costo (`E2E-SUB-*`), presupuesto aprobado, productos y documentos, y los elimina al final.
 *
 * Recorrido: FUR generado desde el presupuesto (una línea por producto y subfase) → FUR manual → OC/OS heredan la subfase
 * → OC directa → salida CONSUMO (PECOSA) con subfase obligatoria → `GET gasto` (directo, indirecto, compromiso).
 */
describe('Subfase en compras y almacén, y gasto por subfase (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  let ccObra = 0; // con presupuesto Principal aprobado
  let ccLibre = 0; // sin presupuesto aprobado
  let producto = 0;
  let servicio = 0;
  let unidad = 0;
  let trabajadorId = 0;
  let proveedorId = 0;
  let c1 = 0; // subfase MATERIALES de la obra
  let c2 = 0; // subfase SERVICIOS de la obra
  let cOtra = 0; // subfase de otro centro de costo
  let idFurGenerado = 0;

  const api = () => apiConSesion(app);
  const num = (v: string | number) => Number(v);
  const redondear2 = (n: number) => Math.round(n * 100) / 100;

  /** Arma fases, categorías e ítems de un presupuesto ya creado. Devuelve los ids de las categorías, en orden. */
  const armar = async (codigo: string, idCc: number, fase: string, cats: Array<{ cat: string; items: Array<[number, number, number]> }>) => {
    const idDetalle = `E2E-SUB-DF-${codigo}`;
    const costoCats = cats.map((c) => redondear2(c.items.reduce((a, [, q, p]) => a + redondear2(q * p), 0)));
    await db.query(
      `insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase", "CostoDirecto") values ($1, $2, $3, $4, $5)`,
      [idDetalle, codigo, idCc, fase, redondear2(costoCats.reduce((a, b) => a + b, 0))],
    );
    const ids: number[] = [];
    for (const [j, c] of cats.entries()) {
      const id = (
        await db.query(
          `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria", "CostoDirecto")
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [`E2E-SUB-DC-${codigo}-${j}`, codigo, idDetalle, idCc, fase, c.cat, costoCats[j]],
        )
      ).rows[0].id as number;
      ids.push(id);
      for (const [k, [idProd, q, p]] of c.items.entries()) {
        await db.query(
          `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "Orden")
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, codigo, idProd, unidad, q, p, redondear2(q * p), k],
        );
      }
    }
    return ids;
  };

  const crearPpto = async (codigo: string, idCc: number) =>
    api().post('/presupuestos').send({ IdPresupuesto: codigo, id_centro_costo: idCc, TipoPpto: 'Principal', Proyecto: 'E2E SUB', Estado: 'PENDIENTE' }).expect(201);

  async function crearItem(tipo: 'PRODUCTO' | 'SERVICIO'): Promise<number> {
    const r = await db.query(
      `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, 1, 1, $3) returning id`,
      [`ZZ-SUB-${Math.random().toString(36).slice(2, 8)}`, `${tipo} DE PRUEBA SUBFASE`, tipo],
    );
    return r.rows[0].id;
  }

  /** Envía, cotiza (todo a S/ 20 la unidad), cierra el cuadro y aprueba: genera la OC de bienes y la OS de servicios. */
  async function aprobarFur(id: number) {
    await api().post(`/requerimientos/${id}/enviar`).send({}).expect(200);
    const fur = (await api().get(`/requerimientos/${id}`).expect(200)).body;
    const cot = await api()
      .post(`/requerimientos/${id}/cotizaciones`)
      .send({
        id_proveedor: proveedorId,
        fecha: hoy,
        moneda_id: 'PEN',
        moneda_simbolo: 'S/',
        forma_pago: 'Contado',
        lineas: fur.lineas.map((l: { id: number; cantidad: string }) => ({ id_requerimiento_detalle: l.id, cantidad: l.cantidad, precio_unitario: '20' })),
      })
      .expect(201);
    await api().post(`/requerimientos/${id}/cerrar-cotizacion`).send({}).expect(200);
    return api().post(`/requerimientos/${id}/aprobar`).send({ id_aprobador: trabajadorId, comentario: 'OK', id_cotizacion_ganadora: cot.body.id });
  }

  const gasto = async () => (await api().get(`/operaciones/obra/${ccObra}/gasto`).expect(200)).body;
  const subfaseDe = (g: { subfases: Array<{ id_ppto_detalle_categoria: number | null }> }, id: number | null) =>
    g.subfases.find((s) => s.id_ppto_detalle_categoria === id);

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id;
    trabajadorId = (await db.query(`select id from anexos where "tipoAnexo" = 'Trabajador' limit 1`)).rows[0].id;
    proveedorId = (await db.query(`select id from anexos where "tipoAnexo" = 'Proveedor' limit 1`)).rows[0].id;
    producto = await crearItem('PRODUCTO');
    servicio = await crearItem('SERVICIO');

    const cliente = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Cliente', 'E2E-SUB Cliente', true) returning id`)).rows[0].id as number;
    const crearCc = async (nombre: string) =>
      (
        await db.query(
          `insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ($1, 'ABIERTO', $2, $3, 2026, $4) returning id`,
          [nombre, inicio, fin, cliente],
        )
      ).rows[0].id as number;
    ccObra = await crearCc('E2E-SUB-OBRA');
    ccLibre = await crearCc('E2E-SUB-LIBRE');

    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-SUB-F1', 'E2E SUB FASE 1')`);
    await db.query(
      `insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion")
       values ('E2E-SUB-C1', 'E2E-SUB-F1', 'E2E SUB MATERIALES'), ('E2E-SUB-C2', 'E2E-SUB-F1', 'E2E SUB SERVICIOS')`,
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      const ccs = `(select id from "CentroCostos" where centro_costo like 'E2E-SUB-%')`;
      const productos = [producto, servicio].filter(Boolean);
      if (productos.length > 0) {
        const docs = (await db.query('select distinct id_documento from almacen_documento_detalle where id_producto = any($1)', [productos])).rows.map((x) => x.id_documento);
        await db.query('delete from almacen_kardex where id_producto = any($1)', [productos]);
        await db.query('delete from almacen_documento_detalle where id_producto = any($1)', [productos]);
        await db.query('update almacen_documento set id_documento_anula = null where id_documento_anula = any($1)', [docs]);
        await db.query('delete from almacen_documento where id = any($1)', [docs]);
        await db.query('delete from stock_almacen where id_producto = any($1)', [productos]);
      }
      await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "documentosOrigen" where id_centro_costo in ${ccs}`);
      await db.query(`update requerimiento set id_cotizacion_ganadora = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from cotizacion where id_requerimiento in (select id from requerimiento where id_centro_costo in ${ccs})`);
      await db.query(`delete from requerimiento where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal_Historial" where "IdPresupuesto" in (select "IdPresupuesto" from "ppto_Principal" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-SUB-%'`);
      await db.query(`delete from "ppto_FasesCategorias" where "IdpptoFaseCategoria" like 'E2E-SUB-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-SUB-%'`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-SUB %'`);
      if (productos.length > 0) await db.query('delete from producto where id = any($1)', [productos]);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  // ─── Presupuesto → FUR ──────────────────────────────────────────────────────
  describe('generar FURs desde el presupuesto', () => {
    it('un presupuesto sin aprobar no genera requerimientos (409)', async () => {
      await crearPpto('E2E-SUB-P0', ccLibre);
      const [cOtraId] = await armar('E2E-SUB-P0', ccLibre, 'E2E-SUB-F1', [{ cat: 'E2E-SUB-C1', items: [[producto, 1, 10]] }]);
      cOtra = cOtraId;

      const res = await api().post('/presupuestos/E2E-SUB-P0/generar-furs').send({}).expect(409);
      expect(res.body.message).toMatch(/presupuesto aprobado/);
    });

    it('con el presupuesto aprobado, una línea por producto y subfase, con su subfase', async () => {
      await crearPpto('E2E-SUB-P1', ccObra);
      [c1, c2] = await armar('E2E-SUB-P1', ccObra, 'E2E-SUB-F1', [
        { cat: 'E2E-SUB-C1', items: [[producto, 10, 5]] },
        { cat: 'E2E-SUB-C2', items: [[producto, 4, 6], [servicio, 2, 15]] },
      ]);
      await api().post('/presupuestos/E2E-SUB-P1/aprobar').expect(200);

      const preview = (await api().get('/presupuestos/E2E-SUB-P1/furs-preview').expect(200)).body;
      expect(preview.fases).toHaveLength(1);
      const lineas = preview.fases[0].items as Array<{ id_producto: number; id_ppto_detalle_categoria: number; subfase: string; cantidad: string }>;
      expect(lineas).toHaveLength(3); // el mismo producto en dos subfases NO se suma
      expect(lineas.filter((l) => l.id_producto === producto).map((l) => [l.id_ppto_detalle_categoria, num(l.cantidad)]).sort()).toEqual(
        [[c1, 10], [c2, 4]].sort(),
      );
      expect(lineas.find((l) => l.id_ppto_detalle_categoria === c1)?.subfase).toBe('E2E SUB MATERIALES');

      const gen = (await api().post('/presupuestos/E2E-SUB-P1/generar-furs').send({}).expect(201)).body;
      expect(gen.furs_generados).toHaveLength(1);
      expect(gen.furs_generados[0].numero).toMatch(/^FUR-\d{6}$/);
      idFurGenerado = gen.furs_generados[0].id;

      const fur = (await api().get(`/requerimientos/${idFurGenerado}`).expect(200)).body;
      expect(fur.fecha.slice(0, 10)).toBe(hoy); // fecha de Lima
      expect(fur.lineas).toHaveLength(3);
      const subfases = fur.lineas.map((l: { id_ppto_detalle_categoria: number; subfase: string }) => [l.id_ppto_detalle_categoria, l.subfase]);
      expect(subfases).toContainEqual([c1, 'E2E SUB MATERIALES']);
      expect(subfases).toContainEqual([c2, 'E2E SUB SERVICIOS']);
    });
  });

  describe('catálogo de subfases de la obra', () => {
    it('lista las subfases del presupuesto aprobado y dice si son obligatorias', async () => {
      const obra = (await api().get(`/subfases?id_centro_costo=${ccObra}`).expect(200)).body;
      expect(obra.requerida).toBe(true);
      expect(obra.subfases.map((x: { id: number; subfase: string; presupuesto: string }) => [x.id, x.subfase, x.presupuesto])).toEqual([
        [c1, 'E2E SUB MATERIALES', 'E2E-SUB-P1'],
        [c2, 'E2E SUB SERVICIOS', 'E2E-SUB-P1'],
      ]);

      // La obra libre solo tiene un presupuesto sin aprobar: no ofrece subfases ni las exige.
      const libre = (await api().get(`/subfases?id_centro_costo=${ccLibre}`).expect(200)).body;
      expect(libre).toMatchObject({ requerida: false, subfases: [] });
      await api().get('/subfases').expect(400);
    });
  });

  // ─── FUR manual ─────────────────────────────────────────────────────────────
  describe('requerimiento manual con subfase', () => {
    const base = () => ({ fecha: hoy, id_centro_costo: ccObra, id_solicitante: trabajadorId, justificacion: 'Prueba e2e subfase' });

    it('el mismo producto puede repetirse en subfases distintas, no en la misma', async () => {
      const ok = await api()
        .post('/requerimientos')
        .send({ ...base(), lineas: [{ id_producto: producto, cantidad: '1', id_ppto_detalle_categoria: c1 }, { id_producto: producto, cantidad: '2', id_ppto_detalle_categoria: c2 }] })
        .expect(201);
      expect(ok.body.lineas).toHaveLength(2);

      await api()
        .post('/requerimientos')
        .send({ ...base(), lineas: [{ id_producto: producto, cantidad: '1', id_ppto_detalle_categoria: c1 }, { id_producto: producto, cantidad: '2', id_ppto_detalle_categoria: c1 }] })
        .expect(400);
    });

    it('la subfase debe ser de un presupuesto aprobado del mismo centro de costo', async () => {
      const ajena = await api()
        .post('/requerimientos')
        .send({ ...base(), lineas: [{ id_producto: producto, cantidad: '1', id_ppto_detalle_categoria: cOtra }] })
        .expect(400);
      expect(JSON.stringify(ajena.body.message)).toMatch(/no pertenece/);

      await api()
        .post('/requerimientos')
        .send({ ...base(), id_centro_costo: ccLibre, lineas: [{ id_producto: producto, cantidad: '1', id_ppto_detalle_categoria: c1 }] })
        .expect(400);
      await api()
        .post('/requerimientos')
        .send({ ...base(), lineas: [{ id_producto: producto, cantidad: '1', id_ppto_detalle_categoria: 999999999 }] })
        .expect(400);
    });

    it('la subfase es opcional: sin ella la línea se guarda sin imputar', async () => {
      const r = await api().post('/requerimientos').send({ ...base(), lineas: [{ id_producto: producto, cantidad: '1' }] }).expect(201);
      expect(r.body.lineas[0].id_ppto_detalle_categoria).toBeNull();
    });
  });

  // ─── OC / OS ────────────────────────────────────────────────────────────────
  describe('OC y OS', () => {
    it('al aprobar el FUR, la OC de bienes y la OS de servicios heredan la subfase de su línea', async () => {
      const res = await aprobarFur(idFurGenerado);
      expect(res.status).toBe(200);

      const docs = (await db.query(`select id, clase_documento from "documentosOrigen" where id_requerimiento = $1 order by id`, [idFurGenerado])).rows;
      expect(docs.map((d) => d.clase_documento).sort()).toEqual(['ORDEN_COMPRA', 'ORDEN_SERVICIO']);

      const lineas: Record<string, Array<[number | null, number]>> = {};
      for (const d of docs) {
        const body = (await api().get(`/documentos/origen/${d.id}`).expect(200)).body;
        lineas[d.clase_documento] = body.detalles.map((x: { id_ppto_detalle_categoria: number | null; monto: string }) => [x.id_ppto_detalle_categoria, num(x.monto)]);
      }
      expect(lineas['ORDEN_COMPRA'].sort()).toEqual([[c1, 200], [c2, 80]].sort());
      expect(lineas['ORDEN_SERVICIO']).toEqual([[c2, 40]]);
    });

    it('el presupuesto Comercial toma de la fase el monto de la cotización ganadora de su FUR (sin IGV)', async () => {
      const c = (await api().get('/presupuestos/E2E-SUB-P1/comercial').expect(200)).body;

      // Meta de la fase: 10×5 + 4×6 + 2×15 = 104; la cotización ganadora cotizó todo a S/ 20: 10×20 + 4×20 + 2×20 = 320.
      expect(c.fases).toHaveLength(1);
      expect(c.fases[0]).toMatchObject({ meta: 104, comercial: 320, fuente: 'COTIZACION', sin_tipo_cambio: false });
      expect(c.fases[0].requerimientos).toEqual([expect.objectContaining({ id: idFurGenerado, monto: 320, estado: 'APROBADO' })]);
      expect(c.total).toEqual({ meta: 104, comercial: 320, diferencia: 216 });
      expect(c.fases_cotizadas).toBe(1);
    });

    it('sin cotización ganadora el Comercial iguala al Meta', async () => {
      await crearPpto('E2E-SUB-P2', ccLibre);
      await armar('E2E-SUB-P2', ccLibre, 'E2E-SUB-F1', [{ cat: 'E2E-SUB-C1', items: [[producto, 2, 10]] }]);
      const c = (await api().get('/presupuestos/E2E-SUB-P2/comercial').expect(200)).body;

      expect(c.fases[0]).toMatchObject({ meta: 20, comercial: 20, fuente: 'META', requerimientos: [] });
      expect(c.total.diferencia).toBe(0);
      await api().get('/presupuestos/NO-EXISTE-SUB/comercial').expect(404);
    });

    it('una OC directa lleva la subfase en su detalle y se valida contra el centro de costo', async () => {
      const detalle = (sub?: number) => [{ id_producto: producto, cantidad: 1, precio: 10, ...(sub ? { id_ppto_detalle_categoria: sub } : {}) }];
      const base = { id_anexo: proveedorId, moneda_simbolo: 'S/', moneda_id: 'PEN', id_centro_costo: ccObra };

      const ok = await api().post('/documentos/origen').send({ ...base, detalles: detalle(c1) }).expect(201);
      expect(ok.body.detalles[0].id_ppto_detalle_categoria).toBe(c1);
      await api().post('/documentos/origen').send({ ...base, detalles: detalle(cOtra) }).expect(400);
      await api().post('/documentos/origen').send({ id_anexo: proveedorId, detalles: detalle(c1) }).expect(400); // sin centro de costo

      // La OC directa de prueba se anula para que no cuente en el gasto de las pruebas siguientes.
      await api().post(`/administracion/documentos-origen/${ok.body.id}/anular`).send({}).expect(200);
    });
  });

  // ─── Salidas (PECOSA) ───────────────────────────────────────────────────────
  describe('salida CONSUMO con subfase', () => {
    let idSalida = 0;
    const salida = (extra: Record<string, unknown>, sub?: number) => ({
      fecha: hoy,
      motivo: 'CONSUMO',
      id_almacen: 1,
      lineas: [{ id_producto: producto, cantidad: '3', ...(sub ? { id_ppto_detalle_categoria: sub } : {}) }],
      ...extra,
    });

    beforeAll(async () => {
      await api()
        .post('/almacen/ingresos')
        .send({ fecha: hoy, motivo: 'COMPRA', id_almacen: 1, lineas: [{ id_producto: producto, cantidad: '20', costo_unitario: '7' }] })
        .expect(201);
    });

    it('con presupuesto aprobado la subfase es obligatoria', async () => {
      const res = await api().post('/almacen/salidas').send(salida({ id_centro_costo: ccObra })).expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(/subfase/);
    });

    it('rechaza una subfase de otra obra, o indicarla sin centro de costo o fuera de CONSUMO', async () => {
      await api().post('/almacen/salidas').send(salida({ id_centro_costo: ccObra }, cOtra)).expect(400);
      await api().post('/almacen/salidas').send(salida({}, c1)).expect(400);
      await api().post('/almacen/salidas').send(salida({ id_centro_costo: ccObra, motivo: 'BAJA' }, c1)).expect(400);
    });

    it('sin presupuesto aprobado en la obra no se exige subfase', async () => {
      await api().post('/almacen/salidas').send(salida({ id_centro_costo: ccLibre })).expect(201);
    });

    it('registra la PECOSA con su subfase y el costo de la salida', async () => {
      const res = await api().post('/almacen/salidas').send(salida({ id_centro_costo: ccObra }, c1)).expect(201);
      idSalida = res.body.id;

      const doc = (await api().get(`/almacen/salidas/${idSalida}`).expect(200)).body;
      expect(doc.lineas[0]).toMatchObject({ id_ppto_detalle_categoria: c1, subfase: 'E2E SUB MATERIALES' });
      expect(num(doc.lineas[0].costo_unitario)).toBe(7);
    });

    it('el mismo producto puede salir a dos subfases en una misma salida', async () => {
      const res = await api()
        .post('/almacen/salidas')
        .send({
          ...salida({ id_centro_costo: ccObra }),
          lineas: [{ id_producto: producto, cantidad: '1', id_ppto_detalle_categoria: c1 }, { id_producto: producto, cantidad: '1', id_ppto_detalle_categoria: c2 }],
        })
        .expect(201);
      await api().post(`/almacen/salidas/${res.body.id}/anular`).expect(200);
    });

    // ─── Gasto ────────────────────────────────────────────────────────────────
    it('el gasto separa directo, indirecto y compromiso sin contar dos veces', async () => {
      const g = await gasto();
      const metaC1 = num((await db.query(`select monto::text from obra_subpartida where id_ppto_detalle_categoria = $1`, [c1])).rows[0].monto);

      // MATERIALES: OC 200; salieron 3 × 7 = 21 → indirecto 21 y compromiso 179 (no 200).
      expect(subfaseDe(g, c1)).toMatchObject({ subfase: 'E2E SUB MATERIALES', meta: metaC1, directo: 0, indirecto: 21, compromiso: 179, ejecutado: 21, proyectado: 200 });
      // SERVICIOS: la OS (2 × 20) es directo; los 4 bienes de la OC (80) siguen comprometidos.
      expect(subfaseDe(g, c2)).toMatchObject({ subfase: 'E2E SUB SERVICIOS', directo: 40, indirecto: 0, compromiso: 80, ejecutado: 40, proyectado: 120 });
      expect(g.total).toMatchObject({ directo: 40, indirecto: 21, compromiso: 259, ejecutado: 61, proyectado: 320 });
      expect(g.lineas_sin_tipo_cambio).toBe(0);
    });

    it('anular la salida devuelve ese gasto al compromiso', async () => {
      await api().post(`/almacen/salidas/${idSalida}/anular`).expect(200);

      const g = await gasto();
      expect(subfaseDe(g, c1)).toMatchObject({ indirecto: 0, compromiso: 200, proyectado: 200 });
    });

    it('anular la OS quita su gasto directo', async () => {
      const os = (await db.query(`select id from "documentosOrigen" where id_requerimiento = $1 and clase_documento = 'ORDEN_SERVICIO'`, [idFurGenerado])).rows[0].id;
      await api().post(`/administracion/documentos-origen/${os}/anular`).send({}).expect(200);

      const g = await gasto();
      expect(subfaseDe(g, c2)).toMatchObject({ directo: 0, compromiso: 80, proyectado: 80 });
    });

    it('una obra inexistente es 404', async () => {
      await api().get('/operaciones/obra/999999999/gasto').expect(404);
    });
  });
});
