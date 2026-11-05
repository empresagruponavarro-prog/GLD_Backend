import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { aDia, deDia, lunesDe } from '../src/features/operaciones-obra/shared/control-avance/calendario.js';
import { hoyLima } from '../src/features/operaciones-obra/shared/obra-shared.js';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Recorrido completo de la cadena presupuesto Meta → obra → liquidación (GRP, plan §7.2) sobre UNA obra, contra la BD de
 * DATABASE_URL. Es el cierre de la fase F9: cada paso usa la API como la usan las pantallas.
 *
 *  2. CC con tipo de proyecto → presupuesto Principal → validar → limpiar vacíos → aprobar (captura la estructura)
 *  3. estructura con monto y peso → 4. En ejecución + avance: la cabecera y el portafolio muestran la misma cifra
 *  5. el inicio no se edita → reprogramación → 6. directorio (dos roles, historial)
 *  7. FUR por fase → cotización → OC con subfase → recepción → PECOSA → gasto por subfase
 *  8. adicional y nueva versión rechazada → 9. 100 % → fin real → planos → dosier → liquidar (CERRADO)
 * 10. usuario de solo consulta. Los pasos 1 (inicio y menú) y las pantallas se prueban en el frontend.
 *
 * Crea todo con el prefijo `E2E-REC` y lo elimina al final.
 */
describe('Recorrido GRP: del presupuesto a la liquidación (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let jwt: JwtService;
  const modoAnterior = process.env['PERMISOS_MODO'];

  const hoy = hoyLima();
  const w1 = lunesDe(aDia(hoy)) - 14; // la obra empezó hace dos semanas
  const inicio = deDia(w1);
  const fin = deDia(w1 + 33);

  const api = () => apiConSesion(app);
  const num = (v: string | number) => Number(v);
  const redondear2 = (n: number) => Math.round(n * 100) / 100;

  let unidad = 0;
  let trabajador = 0;
  let proveedor = 0;
  let cliente = 0;
  let ana = 0;
  let beto = 0;
  let producto = 0;
  let productoVacio = 0;
  let servicio = 0;
  let tipoProyecto = 0;
  let planoA = 0;
  let planoB = 0;
  let rolId = 0;
  let cc = 0;
  let c1 = 0; // subfase MATERIALES
  let c2 = 0; // subfase SERVICIOS
  let idFur = 0;
  const obra = () => `/operaciones/obra/${cc}`;
  const subpartidas = async () =>
    (await db.query(`select id, item, tipo::text tipo, monto::text monto, fecha_inicio::text fi, fecha_fin::text ff from obra_subpartida where id_centro_costo = $1 order by id`, [cc])).rows as {
      id: number;
      item: string;
      tipo: string | null;
      monto: string | null;
      fi: string | null;
      ff: string | null;
    }[];
  const avanceTodas = async (semana: number, avance: number) => {
    const subs = await subpartidas();
    await api()
      .put(`${obra()}/avance/semanas/${semana}`)
      .send({ lineas: subs.map((s) => ({ idSubpartida: s.id, avance })) })
      .expect(200);
  };

  /** Árbol de un presupuesto con SQL directo (como lo deja la pantalla): fase → categorías → ítems [producto, cantidad, costo]. */
  const armar = async (codigo: string, cats: Array<{ cat: string; items: Array<[number, number, number]> }>) => {
    const detalle = `E2E-REC-DF-${codigo}`;
    const costos = cats.map((c) => redondear2(c.items.reduce((a, [, q, p]) => a + redondear2(q * p), 0)));
    await db.query(
      `insert into "ppto_DetalleFases" ("IdPresupuestoDetalle", "IdPresupuesto", id_centro_costo, "IdpptoFase", "CostoDirecto") values ($1, $2, $3, 'E2E-REC-F1', $4)`,
      [detalle, codigo, cc, redondear2(costos.reduce((a, b) => a + b, 0))],
    );
    const ids: number[] = [];
    for (const [j, c] of cats.entries()) {
      const id = (
        await db.query(
          `insert into "ppto_DetalleFasesCate" ("IdPresupuestoDetalleCategoria", "IdPresupuesto", "IdPresupuestoDetalle", id_centro_costo, "IdpptoFase", "IdpptoFaseCategoria", "CostoDirecto")
           values ($1, $2, $3, $4, 'E2E-REC-F1', $5, $6) returning id`,
          [`E2E-REC-DC-${codigo}-${j}`, codigo, detalle, cc, c.cat, costos[j]],
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

  beforeAll(async () => {
    process.env['PERMISOS_MODO'] = 'estricto';
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);

    unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id;
    proveedor = (await db.query(`select id from anexos where "tipoAnexo" = 'Proveedor' limit 1`)).rows[0].id;
    const trab = async (nombre: string) =>
      (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Trabajador', $1, true) returning id`, [nombre])).rows[0].id as number;
    cliente = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Cliente', 'E2E-REC CLIENTE', true) returning id`)).rows[0].id as number;
    ana = await trab('E2E-REC ANA');
    beto = await trab('E2E-REC BETO');
    trabajador = (await db.query(`select id from anexos where "tipoAnexo" = 'Trabajador' and "Anexo" not like 'E2E-REC%' limit 1`)).rows[0].id;
    const item = async (tipo: 'PRODUCTO' | 'SERVICIO') =>
      (
        await db.query(`insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, 1, 1, $3) returning id`, [
          `ZZ-REC-${Math.random().toString(36).slice(2, 8)}`,
          `${tipo} DE PRUEBA RECORRIDO`,
          tipo,
        ])
      ).rows[0].id as number;
    producto = await item('PRODUCTO');
    productoVacio = await item('PRODUCTO');
    servicio = await item('SERVICIO');

    await db.query(`insert into "ppto_Fases" ("IdpptoFase", "FaseProyecto") values ('E2E-REC-F1', 'E2E REC FASE 1')`);
    await db.query(
      `insert into "ppto_FasesCategorias" ("IdpptoFaseCategoria", "IdpptoFase", "Descripcion")
       values ('E2E-REC-C1', 'E2E-REC-F1', 'E2E REC MATERIALES'), ('E2E-REC-C2', 'E2E-REC-F1', 'E2E REC SERVICIOS'), ('E2E-REC-C3', 'E2E-REC-F1', 'E2E REC VACIA')`,
    );

    // Rol y usuario de solo consulta en Centros de Costos (paso 10).
    rolId = (await db.query(`insert into rol (nombre, descripcion, es_sistema) values ('E2E-REC-ROL', 'solo consulta', false) returning id`)).rows[0].id;
    await db.query(
      `insert into rol_permiso (rol_id, modulo_id, ver, crear, editar, eliminar, aprobar, anular) select $1, m.id, true, false, false, false, false, false from modulo m where m.clave = 'centros-costos'`,
      [rolId],
    );
    await db.query(`insert into usuarios ("IdUsuario", "Nombres", "Usuario", "Clave", "Rol", activo, id_area) values ('E2E-REC', 'Solo consulta e2e', 'e2e-rec', null, 'E2E-REC-ROL', true, null)`);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService, { strict: false });
  });

  afterAll(async () => {
    process.env['PERMISOS_MODO'] = modoAnterior;
    if (db) {
      const ccs = `(select id from "CentroCostos" where centro_costo like 'E2E-REC-%')`;
      const productos = [producto, productoVacio, servicio].filter(Boolean);
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
      await db.query(`update "ppto_Principal" set id_version_de = null where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Principal" where id_centro_costo in ${ccs}`);
      await db.query(`delete from "ppto_Fases" where "IdpptoFase" like 'E2E-REC-%'`);
      await db.query(`delete from "ppto_FasesCategorias" where "IdpptoFaseCategoria" like 'E2E-REC-%'`);
      await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-REC-%'`);
      await db.query(`delete from tipo_proyecto_plano where id_tipo_proyecto in (select id from tipo_proyecto where nombre like 'E2E-REC-%')`);
      await db.query(`delete from tipo_proyecto where nombre like 'E2E-REC-%'`);
      await db.query(`delete from tipo_plano where codigo like 'E2E-REC-%'`);
      await db.query(`delete from anexos where "Anexo" like 'E2E-REC %'`);
      await db.query(`delete from usuarios where "IdUsuario" = 'E2E-REC'`);
      await db.query('delete from rol where id = $1', [rolId]);
      if (productos.length > 0) await db.query('delete from producto where id = any($1)', [productos]);
      await borrarUsuarioE2E(db);
      await db.end();
    }
    await app?.close();
  });

  // ─── 2. Centro de costo y presupuesto ─────────────────────────────────────────
  describe('2. centro de costo con tipo de proyecto y presupuesto Principal', () => {
    it('el tipo de proyecto exige dos planos y se copian a la obra al asignarlo', async () => {
      planoA = (await api().post('/proyectos/catalogos/tipos-plano').send({ codigo: 'E2E-REC-ARQ', nombre: 'rec arquitectura' }).expect(201)).body.id;
      planoB = (await api().post('/proyectos/catalogos/tipos-plano').send({ codigo: 'E2E-REC-EST', nombre: 'rec estructuras' }).expect(201)).body.id;
      tipoProyecto = (await api().post('/proyectos/catalogos/tipos-proyecto').send({ nombre: 'e2e-rec-tipo' }).expect(201)).body.id;
      await api()
        .put(`/proyectos/catalogos/tipos-proyecto/${tipoProyecto}/planos`)
        .send({ planos: [{ id_tipo_plano: planoA, obligatorio: true }, { id_tipo_plano: planoB, obligatorio: true }] })
        .expect(200);

      const res = await api()
        .post('/centros-costos')
        .send({ CentroCosto: 'e2e-rec-obra', CodCliente: 'e2e-rec', periodo: 2026, FechaIncio: inicio, FechaFinProg: fin, Estado: 'ABIERTO', id_anexo: cliente, id_tipo_proyecto: tipoProyecto })
        .expect(201);
      cc = res.body.id;
      expect(res.body.CentroCosto).toBe('E2E-REC-OBRA'); // mayúsculas
      const planos = (await api().get(`${obra()}/planos-requeridos`).expect(200)).body;
      expect(planos.items.map((p: { codigo: string; obligatorio: boolean }) => [p.codigo, p.obligatorio])).toEqual([['E2E-REC-ARQ', true], ['E2E-REC-EST', true]]);
    });

    it('un periodo distinto del año de inicio se rechaza (SP-18)', async () => {
      await api().patch(`/centros-costos/${cc}`).send({ periodo: 2027 }).expect(400);
    });

    it('presupuesto Principal: validar → limpiar vacíos → aprobar captura la estructura', async () => {
      await api().post('/presupuestos').send({ IdPresupuesto: 'E2E-REC-P1', id_centro_costo: cc, TipoPpto: 'Principal', Proyecto: 'recorrido', Estado: 'PENDIENTE' }).expect(201);
      [c1, c2] = await armar('E2E-REC-P1', [
        { cat: 'E2E-REC-C1', items: [[producto, 10, 5], [productoVacio, 0, 7]] }, // un ítem en cero
        { cat: 'E2E-REC-C2', items: [[servicio, 2, 15]] },
        { cat: 'E2E-REC-C3', items: [] }, // categoría sin ítems
      ]);

      const antes = (await api().get('/presupuestos/E2E-REC-P1/validacion').expect(200)).body;
      expect(antes.puede_aprobar).toBe(false);
      expect(antes.problemas.map((p: { codigo: string }) => p.codigo).sort()).toEqual(['CATEGORIA_SIN_ITEMS', 'ITEM_VACIO']);
      await api().post('/presupuestos/E2E-REC-P1/aprobar').expect(400);

      const limpio = (await api().post('/presupuestos/E2E-REC-P1/limpiar-vacios').expect(200)).body;
      expect(limpio).toMatchObject({ items_eliminados: 1, categorias_eliminadas: 1 });
      expect((await api().get('/presupuestos/E2E-REC-P1/validacion').expect(200)).body.puede_aprobar).toBe(true);

      const ok = (await api().post('/presupuestos/E2E-REC-P1/aprobar').expect(200)).body;
      expect(ok).toMatchObject({ estado_ppto: 'APROBADO', tipo: 'Principal', estructura: { capturada: true, partidas: 1, subpartidas: 2 } });
    });
  });

  // ─── 3 y 4. Estructura, ejecución y avance ────────────────────────────────────
  describe('3-4. estructura con monto y peso; en ejecución y avance', () => {
    it('la estructura llega con su monto y fechas, y el peso sale del monto', async () => {
      const subs = await subpartidas();
      expect(subs.map((s) => [s.item, num(s.monto ?? '0')])).toEqual([['01.01', 50], ['01.02', 30]]);
      expect(subs.every((s) => s.fi !== null && s.ff !== null)).toBe(true);

    });

    it('la obra inicia, el peso sale del monto y el avance se ve igual en la cabecera, el control y el portafolio', async () => {
      // La ficha necesita al menos el jefe de proyecto para entrar al control de avance.
      await api().patch(`${obra()}/generales`).send({ departamento: 'Lima', id_jefe_proyecto: ana }).expect(200);
      await api().post(`${obra()}/estado`).send({ estado: 'EN_EJECUCION' }).expect(201);
      await avanceTodas(1, 40);

      const ctl = (await api().get(`${obra()}/control`).expect(200)).body;
      // El peso sale del monto de cada subpartida (50 y 30 de 80).
      expect(ctl.resultado.pesoPor).toBe('MONTO');
      expect(ctl.resultado.partidas[0].subpartidas.map((s: { pesoPct: number }) => s.pesoPct)).toEqual([62.5, 37.5]);
      const control = ctl.resultado.real;
      const cabecera = (await api().get(`${obra()}/cockpit`).expect(200)).body.kpis.avance_real_global;
      const filas = (await api().get('/operaciones/portafolio?q=E2E-REC-OBRA').expect(200)).body.obras as { id_centro_costo: number; resultado: { real: number } }[];
      const portafolio = filas.find((o) => o.id_centro_costo === cc)!.resultado.real;

      expect(control).toBeGreaterThan(0);
      expect(cabecera).toBeCloseTo(control, 6);
      expect(portafolio).toBeCloseTo(control, 6);
    });
  });

  // ─── 5. Plazo fijo y reprogramación ───────────────────────────────────────────
  describe('5. el inicio no se edita: se reprograma', () => {
    it('desde el CC y desde la ficha el cambio de inicio da 409', async () => {
      const desde = await api().patch(`/centros-costos/${cc}`).send({ FechaIncio: deDia(w1 + 7) }).expect(409);
      expect(desde.body.message).toMatch(/reprogramaci/i);
      await api().patch(`${obra()}/generales`).send({ fecha_inicio: deDia(w1 + 7) }).expect(409);
    });

    it('la variación se registra como reprogramación y conserva la fecha inicial', async () => {
      const antes = (await api().get(`${obra()}/control`).expect(200)).body.resultado.plazos.finOriginal;
      await api().post(`${obra()}/reprogramaciones`).send({ desde: deDia(w1 + 20), dias: 7, motivo: 'CLIENTE', detalle: 'El cliente aplaza la entrega' }).expect(201);

      const plazos = (await api().get(`${obra()}/control`).expect(200)).body.resultado.plazos;
      expect(plazos.finOriginal).toBe(antes);
      expect(plazos.diasReprogramados).toBe(7);
    });
  });

  // ─── 6. Directorio ────────────────────────────────────────────────────────────
  describe('6. directorio: una tarjeta por rol y historial', () => {
    it('la misma persona como jefe y residente da dos tarjetas; al cambiar al residente queda el historial', async () => {
      await api().patch(`${obra()}/generales`).send({ departamento: 'Lima', id_jefe_proyecto: ana, id_residente: ana }).expect(200);
      const tarjetas = (await api().get(`${obra()}/residentes`).expect(200)).body as { clave: string }[];
      expect(tarjetas.map((t) => t.clave)).toEqual([`equipo-${ana}-jefe_proyecto`, `equipo-${ana}-residente`]);

      await api().patch(`${obra()}/generales`).send({ id_residente: beto }).expect(200);
      const historial = (await api().get(`${obra()}/residentes/historial`).expect(200)).body as { id_anexo?: number; rol_obra: string; fecha_baja?: string }[];
      expect(historial).toHaveLength(1);
      expect(historial[0]).toMatchObject({ id_anexo: ana, rol_obra: 'Residente', fecha_baja: hoy });
    });
  });

  // ─── 7. Compras, almacén y gasto por subfase ──────────────────────────────────
  describe('7. FUR por fase → cotización → OC con subfase → recepción → PECOSA → gasto', () => {
    let ocBienes = 0;

    it('generar FURs crea una línea por producto y subfase', async () => {
      const gen = (await api().post('/presupuestos/E2E-REC-P1/generar-furs').send({ id_solicitante: trabajador }).expect(201)).body;
      expect(gen.furs_generados).toHaveLength(1);
      idFur = gen.furs_generados[0].id;
      const fur = (await api().get(`/requerimientos/${idFur}`).expect(200)).body;
      expect(fur.lineas.map((l: { id_ppto_detalle_categoria: number }) => l.id_ppto_detalle_categoria).sort()).toEqual([c1, c2].sort());
    });

    it('cotizar y aprobar genera la OC de bienes y la OS de servicios con la subfase de cada línea', async () => {
      await api().post(`/requerimientos/${idFur}/enviar`).send({}).expect(200);
      const fur = (await api().get(`/requerimientos/${idFur}`).expect(200)).body;
      const cot = await api()
        .post(`/requerimientos/${idFur}/cotizaciones`)
        .send({
          id_proveedor: proveedor,
          fecha: hoy,
          moneda_id: 'PEN',
          moneda_simbolo: 'S/',
          forma_pago: 'Contado',
          lineas: fur.lineas.map((l: { id: number; cantidad: string }) => ({ id_requerimiento_detalle: l.id, cantidad: l.cantidad, precio_unitario: '20' })),
        })
        .expect(201);
      await api().post(`/requerimientos/${idFur}/cerrar-cotizacion`).send({}).expect(200);
      await api().post(`/requerimientos/${idFur}/aprobar`).send({ id_aprobador: trabajador, comentario: 'OK', id_cotizacion_ganadora: cot.body.id }).expect(200);

      const docs = (await db.query(`select id, clase_documento from "documentosOrigen" where id_requerimiento = $1 order by id`, [idFur])).rows;
      expect(docs.map((d) => d.clase_documento).sort()).toEqual(['ORDEN_COMPRA', 'ORDEN_SERVICIO']);
      ocBienes = docs.find((d) => d.clase_documento === 'ORDEN_COMPRA').id;
      const oc = (await api().get(`/documentos/origen/${ocBienes}`).expect(200)).body;
      expect(oc.detalles[0].id_ppto_detalle_categoria).toBe(c1);
    });

    it('la recepción de la OC ingresa el stock y la PECOSA lo consume en una subfase', async () => {
      const oc = (await api().get(`/documentos/origen/${ocBienes}`).expect(200)).body;
      await api()
        .post('/almacen/recepciones')
        .send({ id_orden_compra: ocBienes, id_almacen: 1, fecha: hoy, lineas: [{ id_orden_compra_detalle: oc.detalles[0].id, cantidad: '10' }] })
        .expect(201);

      // Con presupuesto aprobado la subfase es obligatoria en la salida.
      await api().post('/almacen/salidas').send({ fecha: hoy, motivo: 'CONSUMO', id_almacen: 1, id_centro_costo: cc, lineas: [{ id_producto: producto, cantidad: '3' }] }).expect(400);
      const salida = await api()
        .post('/almacen/salidas')
        .send({ fecha: hoy, motivo: 'CONSUMO', id_almacen: 1, id_centro_costo: cc, lineas: [{ id_producto: producto, cantidad: '3', id_ppto_detalle_categoria: c1 }] })
        .expect(201);
      expect(num(salida.body.lineas[0].costo_unitario)).toBe(20);
    });

    it('la pestaña Liquidación muestra el gasto por subfase: directo, indirecto y compromiso', async () => {
      const g = (await api().get(`${obra()}/gasto`).expect(200)).body;
      const sub = (id: number) => g.subfases.find((s: { id_ppto_detalle_categoria: number | null }) => s.id_ppto_detalle_categoria === id);

      // MATERIALES: OC 10 × 20 = 200; salieron 3 × 20 = 60 → indirecto 60 y compromiso 140.
      expect(sub(c1)).toMatchObject({ meta: 50, directo: 0, indirecto: 60, compromiso: 140, proyectado: 200, sobre_meta: true });
      // SERVICIOS: la OS (2 × 20) es directo.
      expect(sub(c2)).toMatchObject({ meta: 30, directo: 40, indirecto: 0, compromiso: 0, proyectado: 40, sobre_meta: true });
      expect(g.total).toMatchObject({ meta: 80, directo: 40, indirecto: 60, compromiso: 140, proyectado: 240 });
    });

    it('el presupuesto Comercial toma la cotización ganadora de la fase', async () => {
      const c = (await api().get('/presupuestos/E2E-REC-P1/comercial').expect(200)).body;
      expect(c.fases[0]).toMatchObject({ meta: 80, comercial: 240, fuente: 'COTIZACION' });
      expect(c.total.diferencia).toBe(160);
    });
  });

  // ─── 8. Adicional y nueva versión ─────────────────────────────────────────────
  describe('8. adicional y nueva versión', () => {
    it('un adicional agrega partidas adicionales; una nueva versión con avance se rechaza', async () => {
      await api().post('/presupuestos').send({ IdPresupuesto: 'E2E-REC-A1', id_centro_costo: cc, TipoPpto: 'Adicional', Proyecto: 'adicional', Estado: 'PENDIENTE' }).expect(201);
      await armar('E2E-REC-A1', [{ cat: 'E2E-REC-C1', items: [[producto, 1, 10]] }]);
      const ad = (await api().post('/presupuestos/E2E-REC-A1/aprobar').expect(200)).body;
      expect(ad).toMatchObject({ tipo: 'Adicional', estado_ppto: 'APROBADO' });
      const subs = await subpartidas();
      expect(subs.filter((s) => s.tipo === 'ADICIONAL')).toHaveLength(1);

      const res = await api().post('/presupuestos/E2E-REC-P1/nueva-version').expect(409);
      expect(res.body.message).toMatch(/avance/);
    });
  });

  // ─── 9. Fin de obra, dosier y liquidación ─────────────────────────────────────
  describe('9. 100 % → fin real → planos → dosier → liquidar', () => {
    it('antes del 100 % no hay fecha de fin real', async () => {
      const res = await api().patch(`/centros-costos/${cc}`).send({ FechaFinReal: hoy }).expect(409);
      expect(res.body.message).toMatch(/% de avance/);
    });

    it('al completar el avance, entregar la obra fija la fecha de fin real y pasa a liquidación', async () => {
      await avanceTodas(1, 50);
      await avanceTodas(2, 50);
      await api().post(`${obra()}/estado`).send({ estado: 'POST_VENTA' }).expect(201);
      await api().patch(`/centros-costos/${cc}`).send({ Estado: 'POR LIQUIDAR' }).expect(200);
      const fila = (await db.query(`select estado, fecha_fin_real::text fin_real from "CentroCostos" where id = $1`, [cc])).rows[0];
      expect(fila).toEqual({ estado: 'POR LIQUIDAR', fin_real: hoy });
    });

    it('sin los planos obligatorios no se emite el dosier ni se liquida', async () => {
      const dos = await api().get(`${obra()}/dosier`).expect(409);
      expect(dos.body.message).toMatch(/faltan 2 plano/);
      await api().post(`${obra()}/liquidacion`).expect(409);
    });

    it('con los planos marcados se emite el dosier y se liquida: el centro de costo queda CERRADO', async () => {
      await api().put(`${obra()}/planos-requeridos/${planoA}`).send({ entregado: true }).expect(200);
      await api().put(`${obra()}/planos-requeridos/${planoB}`).send({ entregado: true }).expect(200);

      const dosier = (await api().get(`${obra()}/dosier`).expect(200)).body;
      const por = (c: string) => dosier.secciones.find((s: { codigo: string }) => s.codigo === c);
      expect(por('PRESUPUESTO_META').referencias).toEqual(expect.arrayContaining(['E2E-REC-P1', 'E2E-REC-A1']));
      expect(por('PRESUPUESTO_COMERCIAL')).toMatchObject({ disponible: true, referencias: ['E2E-REC-P1'] });
      expect(por('FICHA_OBRA').disponible).toBe(true);
      expect(por('INFORME_AVANCE').disponible).toBe(true);

      const liq = (await api().post(`${obra()}/liquidacion`).expect(200)).body;
      expect(liq).toMatchObject({ liquidada: true, estado_cc: 'CERRADO', fecha_liquidacion: hoy });
      const fila = (await db.query(`select estado from "CentroCostos" where id = $1`, [cc])).rows[0];
      expect(fila.estado).toBe('CERRADO');
      const ppto = (await db.query(`select estado_ppto::text e from "ppto_Principal" where "IdPresupuesto" = 'E2E-REC-P1'`)).rows[0];
      expect(ppto.e).toBe('LIQUIDADO');
    });
  });

  // ─── 10. Solo consulta ────────────────────────────────────────────────────────
  describe('10. usuario de solo consulta', () => {
    const consulta = () => {
      const auth = `Bearer ${jwt.sign({ sub: 'E2E-REC', usuario: 'e2e-rec', rol: 'E2E-REC-ROL' })}`;
      const server = app.getHttpServer();
      return {
        get: (url: string) => request(server).get(url).set('Authorization', auth),
        post: (url: string) => request(server).post(url).set('Authorization', auth),
        patch: (url: string) => request(server).patch(url).set('Authorization', auth),
        delete: (url: string) => request(server).delete(url).set('Authorization', auth),
      };
    };

    it('ve los centros de costo pero no puede crear, editar ni eliminar', async () => {
      await consulta().get('/centros-costos').expect(200);
      await consulta().post('/centros-costos').send({ CentroCosto: 'E2E-REC-NO', CodCliente: 'x', periodo: 2026, FechaIncio: inicio }).expect(403);
      await consulta().patch(`/centros-costos/${cc}`).send({ CodCliente: 'cambio' }).expect(403);
      await consulta().delete(`/centros-costos/${cc}`).expect(403);
    });
  });
});
