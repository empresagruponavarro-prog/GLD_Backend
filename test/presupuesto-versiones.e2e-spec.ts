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
 * Plan 09, F5, contra la BD de DATABASE_URL: una nueva versión del Principal copia las cotizaciones y los proveedores ganadores; lo que las
 * versiones anteriores ya pidieron con órdenes registradas no se vuelve a pedir (se pide solo la diferencia), un proveedor distinto es un
 * conflicto que bloquea la aprobación y las órdenes provisionales de la versión que se reemplaza se anulan.
 * Crea sus centros de costo (`E2E-PV-*`) y los elimina al final.
 */
describe('Presupuesto Meta: nuevas versiones con cotizaciones y compromisos (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14;
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  let producto = 0;
  let servicio = 0;
  let unidad = 0;
  let provA = 0;
  let provB = 0;
  let trabajadorId = 0;
  let cliente = 0;
  let ccObra1 = 0;

  const api = () => apiConSesion(app);
  const redondear2 = (n: number) => Math.round(n * 100) / 100;

  const crearCc = async (nombre: string) =>
    (
      await db.query(`insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ($1, 'ABIERTO', $2, $3, 2026, $4) returning id`, [nombre, inicio, fin, cliente])
    ).rows[0].id as number;

  /** Presupuesto Principal con una fase y los ítems indicados (cada ítem es su propia subpartida); devuelve ids. */
  const crearPpto = async (codigo: string, idCc: number, items: Array<[number, number, number]>) => {
    const id = (await api().post('/presupuestos').send({ IdPresupuesto: codigo, id_centro_costo: idCc, TipoPpto: 'Principal', Proyecto: 'E2E PV', Estado: 'PENDIENTE' }).expect(201)).body.id as number;
    const costo = redondear2(items.reduce((a, [, q, p]) => a + redondear2(q * p), 0));
    const idFase = (
      await db.query(`insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase", "CostoDirecto") values ($1, $2, $3, 'E2E-PV-F1', $4) returning id`, [`E2E-PV-DF-${codigo}`, codigo, idCc, costo])
    ).rows[0].id as number;
    const ids: number[] = [];
    const subs: number[] = [];
    for (const [k, [idProd, q, p]] of items.entries()) {
      const idCat = (
        await db.query(
          `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria", "CostoDirecto")
           values ($1, $2, $3, $4, 'E2E-PV-F1', $5, $6) returning id`,
          [`E2E-PV-DC-${codigo}-${k}`, codigo, `E2E-PV-DF-${codigo}`, idCc, `E2E-PV-C${k + 1}`, redondear2(q * p)],
        )
      ).rows[0].id as number;
      subs.push(idCat);
      ids.push(
        (
          await db.query(
            `insert into "ppto_DetalleItems" (id_detalle_categoria, "IdPresupuesto", id_producto, id_unidad_medida, "Cantidad", "CostoUnitario", "CostoTotal", "CostoTotalMeta", "Orden")
             values ($1, $2, $3, $4, $5, $6, $7, $7, $8) returning id`,
            [idCat, codigo, idProd, unidad, q, p, redondear2(q * p), 0],
          )
        ).rows[0].id as number,
      );
    }
    return { id, idFase, subs, items: ids };
  };

  /** Cotiza una subpartida con un total (con `adjudicar`, el proveedor gana la subpartida completa). */
  const cotizar = (idPpto: number, idSubpartida: number, idProveedor: number, total: string, adjudicar = false) =>
    api()
      .post(`/presupuestos/${idPpto}/cotizaciones`)
      .send({
        id_detalle_categoria: idSubpartida,
        id_proveedor: idProveedor,
        total,
        fecha: hoy,
        moneda_id: 'PEN',
        moneda_simbolo: 'S/',
        forma_pago: 'Contado',
        ...(adjudicar ? { adjudicar: true } : {}),
      });
  const adjudicar = (idPpto: number, idSubpartida: number, idCotizacion: number | null) =>
    api().put(`/presupuestos/${idPpto}/adjudicacion`).send({ id_detalle_categoria: idSubpartida, id_cotizacion: idCotizacion });

  const dos = async (codigo: string) =>
    (
      await db.query(
        `select d.id, d.numero_documento, d.clase_documento, d.estado, d.monto::float as monto, d.id_anexo, r.estado as estado_fur
           from "documentosOrigen" d join requerimiento r on r.id = d.id_requerimiento
          where r.id_ppto_principal = (select id from "ppto_Principal" where "IdPresupuesto" = $1) order by d.id`,
        [codigo],
      )
    ).rows;

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id;
    const categoria = (await db.query(`select id from categoria order by id limit 1`)).rows[0].id as number;
    const crearProducto = async (tipo: string) =>
      (
        await db.query(`insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, $3, $4, $5) returning id`, [
          `ZZ-PV-${Math.random().toString(36).slice(2, 8)}`,
          `${tipo} DE PRUEBA VERSIONES`,
          categoria,
          unidad,
          tipo,
        ])
      ).rows[0].id as number;
    producto = await crearProducto('PRODUCTO');
    servicio = await crearProducto('SERVICIO');
    const anexo = async (tipo: string, nombre: string) =>
      (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ($1, $2, true) returning id`, [tipo, nombre])).rows[0].id as number;
    provA = await anexo('Proveedor', 'E2E-PV Proveedor A');
    provB = await anexo('Proveedor', 'E2E-PV Proveedor B');
    cliente = await anexo('Cliente', 'E2E-PV Cliente');
    trabajadorId = await anexo('Trabajador', 'E2E-PV Trabajador');
    await db.query(`insert into trabajador (id_anexo) values ($1)`, [trabajadorId]);
    await db.query(`update usuarios set id_trabajador = $1 where "IdUsuario" = $2`, [trabajadorId, USUARIO_E2E]);
    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-PV-F1', 'E2E PV FASE 1')`);
    await db.query(`insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion") values ('E2E-PV-C1', 'E2E-PV-F1', 'E2E PV SUBFASE 1'), ('E2E-PV-C2', 'E2E-PV-F1', 'E2E PV SUBFASE 2')`);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      const ccs = `(select id from "CentroCostos" where centro_costo like 'E2E-PV-%')`;
      await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in (select id from "documentosOrigen" where id_centro_costo in ${ccs})`);
      await db.query(`delete from "documentosOrigen" where id_centro_costo in ${ccs}`);
      await db.query(`update requerimiento set id_cotizacion_ganadora = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from cotizacion where id_requerimiento in (select id from requerimiento where id_centro_costo in ${ccs})`);
      await db.query(`delete from requerimiento where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal_Historial" where "IdPresupuesto" in (select "IdPresupuesto" from "ppto_Principal" where id_centro_costo in ${ccs})`);
      await db.query(`update "ppto_Principal" set id_version_de = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-PV-%'`);
      await db.query(`delete from "ppto_FasesCategorias" where "IdpptoFaseCategoria" like 'E2E-PV-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-PV-%'`);
      await borrarUsuarioE2E(db);
      await db.query(`delete from trabajador where id_anexo in (select id from anexos where "Anexo" like 'E2E-PV %')`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-PV %'`);
      await db.query(`delete from producto where id = any($1)`, [[producto, servicio].filter(Boolean)]);
      await db.end();
    }
    await app?.close();
  });

  // ─── Escenario 1: una versión del Principal ya aprobado, con órdenes registradas ──────────────
  describe('versión de un presupuesto aprobado: lo ya pedido no se vuelve a pedir', () => {
    let v1: { id: number; idFase: number; subs: number[]; items: number[] };
    let v2 = { id: 0, codigo: '', idFase: 0, subs: [] as number[], items: [] as number[] };

    beforeAll(async () => {
      const cc = (ccObra1 = await crearCc('E2E-PV-OBRA-1'));
      v1 = await crearPpto('E2E-PV-P1', cc, [[producto, 10, 5], [servicio, 2, 15]]);
    });

    it('con todo adjudicado se aprueba: la OC y la OS quedan registradas', async () => {
      await cotizar(v1.id, v1.subs[0], provA, '45', true).expect(201); // 10 × 4.50
      await cotizar(v1.id, v1.subs[1], provA, '40', true).expect(201); // 2 × 20
      await api().post('/presupuestos/E2E-PV-P1/aprobar').expect(200);
      expect((await dos('E2E-PV-P1')).map((d) => [d.clase_documento, d.estado])).toEqual(expect.arrayContaining([['ORDEN_COMPRA', 'REGISTRADO'], ['ORDEN_SERVICIO', 'REGISTRADO']]));
    });

    it('la nueva versión copia ítems (con su origen), cotizaciones y proveedores ganadores, y no genera nada nuevo', async () => {
      const res = (await api().post(`/presupuestos/${v1.id}/nueva-version`).expect(201)).body;
      v2 = { ...v2, id: res.id, codigo: res.id_presupuesto };
      expect(res).toMatchObject({ numero_version: 2, items: 2, cotizaciones: 2, adjudicaciones: 2 });

      const items = (await db.query(`select id, id_item_origen, id_ppto_cot_detalle_ganadora as g, adjudicado_por from "ppto_DetalleItems" where "IdPresupuesto" = $1 order by "Orden"`, [v2.codigo])).rows;
      expect(items.map((i) => i.id_item_origen)).toEqual(v1.items);
      expect(items.every((i) => i.g !== null && i.adjudicado_por === 'e2e-admin')).toBe(true);
      v2.items = items.map((i) => i.id);
      v2.idFase = (await db.query(`select id from "ppto_DetalleFases" where "IdPresupuesto" = $1`, [v2.codigo])).rows[0].id;
      v2.subs = (await db.query(`select id from "ppto_DetalleFasesCate" where "IdPresupuesto" = $1 order by id`, [v2.codigo])).rows.map((r) => r.id as number);

      // Cada cotización viaja a la subpartida nueva que le corresponde, con su total y su marca de prorrateo.
      const cots = (await db.query(`select numero, id_proveedor, id_detalle_categoria as sub, prorrateada, total_global::float as total, registrado_por, (select count(*)::int from ppto_cotizacion_detalle where id_cotizacion = c.id) as lineas from ppto_cotizacion c where id_presupuesto = $1 order by id`, [v2.id])).rows;
      expect(cots).toHaveLength(2);
      expect(cots[0]).toMatchObject({ id_proveedor: provA, sub: v2.subs[0], prorrateada: true, total: 45, lineas: 1, registrado_por: 'e2e-admin' });
      expect(cots[1]).toMatchObject({ id_proveedor: provA, sub: v2.subs[1], prorrateada: true, total: 40, lineas: 1 });
      const numerosV1 = (await db.query(`select numero from ppto_cotizacion where id_presupuesto = $1`, [v1.id])).rows.map((r) => r.numero);
      expect(numerosV1).not.toContain(cots[0].numero);
      // Las cotizaciones de la versión anterior se conservan.
      expect(numerosV1).toHaveLength(2);

      const panel = (await api().get(`/presupuestos/${v2.id}/compromisos`).expect(200)).body;
      expect(panel).toMatchObject({ items_total: 2, items_adjudicados: 2, items_sin_adjudicar: [], conflictos: [], compromisos: [] });
    });

    it('si un ítem crece, se pide solo la diferencia a su mismo proveedor; si baja, nada', async () => {
      const cambiarCantidad = async (idCat: number, item: number, cantidad: number) => {
        const actuales = (await api().get(`/presupuestos/categorias-asignadas/${idCat}/items`).expect(200)).body.items as Array<{ id: number; id_producto: number; id_unidad_medida: number; Cantidad: number; CostoUnitario: number; PrecioVenta: number }>;
        const envio = actuales.map((i) => ({ id: i.id, id_producto: i.id_producto, id_unidad_medida: i.id_unidad_medida, Cantidad: i.id === item ? cantidad : i.Cantidad, CostoUnitario: i.CostoUnitario, PrecioVenta: i.PrecioVenta }));
        return api().put(`/presupuestos/categorias-asignadas/${idCat}/items`).send({ items: envio }).expect(200);
      };

      // 10 → 13 bienes y 2 → 1 servicio: se pide una OC por 3 unidades; el servicio sigue cubierto.
      const res = await cambiarCantidad(v2.subs[0], v2.items[0], 13);
      expect(res.body.compromisos.creados).toHaveLength(1);
      expect(res.body.compromisos.creados[0].documentos.map((d: { clase: string }) => d.clase)).toEqual(['ORDEN_COMPRA']);
      const baja = await cambiarCantidad(v2.subs[1], v2.items[1], 1);
      expect(baja.body.compromisos.creados).toEqual([]);

      const nuevos = (await dos(v2.codigo)).filter((d) => d.estado !== 'ANULADO');
      expect(nuevos).toHaveLength(1);
      expect(nuevos[0]).toMatchObject({ clase_documento: 'ORDEN_COMPRA', estado: 'PROVISIONAL', id_anexo: provA, monto: 13.5 }); // 3 × S/ 4.50
      const lineas = (await db.query(`select cantidad::float as c from requerimiento_detalle where id_requerimiento = (select id_requerimiento from "documentosOrigen" where id = $1)`, [nuevos[0].id])).rows;
      expect(lineas.map((l) => l.c)).toEqual([3]);
    });

    it('cambiar el proveedor de un ítem ya pedido es un conflicto: no genera nada y bloquea la aprobación', async () => {
      const cotB = (await cotizar(v2.id, v2.subs[1], provB, '30').expect(201)).body.id as number; // 1 × 30
      const antes = (await dos(v2.codigo)).filter((d) => d.estado !== 'ANULADO').length;
      const r = (await adjudicar(v2.id, v2.subs[1], cotB).expect(200)).body;
      expect(r.compromisos.creados).toEqual([]); // el servicio ya se pidió a otro proveedor
      expect((await dos(v2.codigo)).filter((d) => d.estado !== 'ANULADO')).toHaveLength(antes);

      const panel = (await api().get(`/presupuestos/${v2.id}/compromisos`).expect(200)).body;
      expect(panel.conflictos).toHaveLength(1);
      expect(panel.conflictos[0].documentos[0]).toMatch(/^OS-\d{6}$/);
      const v = (await api().get(`/presupuestos/${v2.codigo}/validacion`).expect(200)).body;
      expect(v.puede_aprobar).toBe(false);
      expect(v.bloqueos.map((b: { codigo: string }) => b.codigo)).toEqual(['COMPROMISO_EN_CONFLICTO']);
      const ap = await api().post(`/presupuestos/${v2.codigo}/aprobar`).expect(409);
      expect(ap.body.message).toMatch(/otro proveedor/);
    });

    it('al volver al mismo proveedor el conflicto desaparece y la versión se aprueba: la anterior pasa a ANULADO y sus órdenes registradas se conservan', async () => {
      // El servicio bajó a 1 unidad: para que A vuelva a ganarlo, su cotización debe ofrecer esa cantidad completa (un ítem va completo a un proveedor).
      const cotsA = (await db.query(`select id, id_detalle_categoria as sub from ppto_cotizacion where id_presupuesto = $1 and id_proveedor = $2 order by id`, [v2.id, provA])).rows as Array<{ id: number; sub: number }>;
      const cotA0 = cotsA.find((c) => c.sub === v2.subs[0])!.id;
      const cotA1 = cotsA.find((c) => c.sub === v2.subs[1])!.id;
      await api().patch(`/presupuestos/${v2.id}/cotizaciones/${cotA0}`).send({ total: '58.5' }).expect(200); // 13 × 4.50
      await api().patch(`/presupuestos/${v2.id}/cotizaciones/${cotA1}`).send({ total: '20' }).expect(200); // 1 × 20
      await adjudicar(v2.id, v2.subs[1], cotA1).expect(200);
      expect((await api().get(`/presupuestos/${v2.id}/compromisos`).expect(200)).body.conflictos).toEqual([]);

      const ok = (await api().post(`/presupuestos/${v2.codigo}/aprobar`).expect(200)).body;
      expect(ok).toMatchObject({ estado_ppto: 'APROBADO', documentos_cerrados: 1, reemplaza: { id: v1.id, id_presupuesto: 'E2E-PV-P1' } });
      expect((await db.query(`select estado_ppto from "ppto_Principal" where id = $1`, [v1.id])).rows[0].estado_ppto).toBe('ANULADO');
      // Las órdenes de la versión 1 siguen registradas (compromisos con el proveedor) y la OC por la diferencia de la versión 2 también.
      expect((await dos('E2E-PV-P1')).every((d) => d.estado === 'REGISTRADO')).toBe(true);
      expect((await dos(v2.codigo)).filter((d) => d.estado !== 'ANULADO').map((d) => d.estado)).toEqual(['REGISTRADO']);
    });

    it('el avance que se registra en la versión vigente llega a la orden de servicio de la versión anterior (C-5)', async () => {
      // La obra entra al control de avance con la estructura de la versión 2: sus subpartidas tienen ids nuevos, distintos de los que
      // imputó la orden de la versión 1.
      const obra = `/operaciones/obra/${ccObra1}`;
      await api().patch(`${obra}/generales`).send({ id_distrito: '150101', id_jefe_proyecto: trabajadorId }).expect(200);
      await api().post(`${obra}/estado`).send({ estado: 'EN_EJECUCION' }).expect(201);
      const subs = (await db.query(`select id, id_ppto_detalle_categoria as sub from obra_subpartida where id_centro_costo = $1`, [ccObra1])).rows as Array<{ id: number; sub: number }>;
      expect(subs.map((s) => s.sub).sort()).toEqual([...v2.subs].sort()); // la estructura es la de la versión 2
      await api().put(`${obra}/avance/semanas/1`).send({ lineas: [{ idSubpartida: subs.find((s) => s.sub === v2.subs[1])!.id, avance: 60 }] }).expect(200);

      const os = (await dos('E2E-PV-P1')).find((d) => d.clase_documento === 'ORDEN_SERVICIO')!;
      const det = (await api().get(`/administracion/documentos-origen/${os.id}`).expect(200)).body;
      expect(det.tope_avance).toMatchObject({ avance_pct: 60 });
      const v = (await api().get(`/administracion/documentos-origen/${os.id}/valorizacion`).expect(200)).body;
      expect(v.lineas[0]).toMatchObject({ avance_pct: 60 });
    });
  });

  // ─── Escenario 2: una versión de un presupuesto que todavía no se aprobó ───────────────────────
  describe('versión de un presupuesto sin aprobar: se anulan las órdenes provisionales de la anterior', () => {
    it('al aprobar la versión, el FUR y las órdenes provisionales de la anterior se anulan y la versión genera las suyas', async () => {
      const cc = await crearCc('E2E-PV-OBRA-2');
      const p = await crearPpto('E2E-PV-P2', cc, [[producto, 4, 10]]);
      await cotizar(p.id, p.subs[0], provA, '36', true).expect(201); // 4 × 9
      const provisionales = (await dos('E2E-PV-P2')).filter((d) => d.estado === 'PROVISIONAL');
      expect(provisionales).toHaveLength(1);

      const v = (await api().post(`/presupuestos/${p.id}/nueva-version`).expect(201)).body;
      expect(v).toMatchObject({ cotizaciones: 1, adjudicaciones: 1 });
      // La versión copia la adjudicación, pero nada estaba registrado: todavía no tiene FUR propio.
      expect(await dos(v.id_presupuesto)).toHaveLength(0);
      // Un cambio (o la propia aprobación) hace que genere los suyos.
      const ok = (await api().post(`/presupuestos/${v.id_presupuesto}/aprobar`).expect(200)).body;
      expect(ok).toMatchObject({ estado_ppto: 'APROBADO', documentos_cerrados: 1, reemplaza: { id: p.id } });

      const anterior = await dos('E2E-PV-P2');
      expect(anterior.map((d) => d.estado)).toEqual(['ANULADO']);
      expect(anterior[0].estado_fur).toBe('ANULADO');
      const motivo = (await db.query(`select comentarios from "documentosOrigen" where id = $1`, [anterior[0].id])).rows[0].comentarios;
      expect(motivo).toMatch(/ANULADO: Reemplazado por la versión/);
      const nuevos = await dos(v.id_presupuesto);
      expect(nuevos).toHaveLength(1);
      expect(nuevos[0]).toMatchObject({ estado: 'REGISTRADO', clase_documento: 'ORDEN_COMPRA', id_anexo: provA, monto: 36 });
    });
  });
});
