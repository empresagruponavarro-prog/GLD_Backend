import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import { App } from 'supertest/types';
import { altaAutomaticaDeOrdenes } from '../src/features/valorizaciones/shared/alta-contrato.js';
import { insertarDocumentoOrigen } from '../src/features/documentos/shared/documento-origen-insert.js';
import { AlmacenSql } from '../src/features/almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../src/features/almacen/shared/inventario-ledger.js';
import { hoyLima } from '../src/features/operaciones-obra/shared/obra-shared.js';
import { DB, type Database } from '../src/prisma/prisma.module.js';
import { apiConSesion, borrarUsuarioE2E, crearUsuarioE2E } from './helpers/sesion.js';
import { AppModule } from './../src/app.module.js';

/**
 * Plan 12 (valorizaciones de contratistas) contra la BD de DATABASE_URL: contrato con dos vistos, tres valorizaciones con deductivo y avance
 * manual, liquidación y devolución de la garantía, y las guardas sobre la orden. Crea sus datos (`E2E-VAL-*`) y los elimina al final.
 */
describe('Valorizaciones de contratistas (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  const hoy = hoyLima();

  let cc = 0;
  let proveedor = 0;
  let idOs = 0;
  let lineaA = 0;
  let lineaB = 0;
  let idContrato = 0;
  let cuenta = 0;
  const api = () => apiConSesion(app);
  const num = (v: string | number) => Number(v);

  const crearOs = async (): Promise<number> => {
    const database = app.get<Database>(DB);
    const sql = app.get(AlmacenSql);
    const ledger = app.get(InventarioLedger);
    const categoria = (await db.query(`select id from categoria order by id limit 1`)).rows[0].id as number;
    const unidad = (await db.query(`select id from unidad_medida order by id limit 1`)).rows[0].id as number;
    const producto = async (desc: string) =>
      (
        await db.query(`insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto) values ($1, $2, $3, $4, 'SERVICIO') returning id`, [
          `ZZ-VAL-${Math.random().toString(36).slice(2, 8)}`,
          desc,
          categoria,
          unidad,
        ])
      ).rows[0].id as number;
    const a = await producto('SERVICIO A E2E-VAL');
    const b = await producto('SERVICIO B E2E-VAL');
    return database.transaction(async (tx) => {
      const doc = await insertarDocumentoOrigen(sql, ledger, tx, {
        clase: 'ORDEN_SERVICIO',
        tipoOc: 'SERVICIO',
        idCentroCosto: cc,
        idFase: null,
        idArea: null,
        idAnexo: proveedor,
        idCategoria: categoria,
        fechaEmision: hoy,
        formaPago: 'CONTADO',
        monedaId: 'PEN',
        monedaSimbolo: 'S/',
        monto: 10000,
        afectoIgv: true,
        diasCredito: null,
        fechaVencimiento: null,
        comentarios: 'E2E-VAL orden de servicio',
        idRequerimiento: null,
        idCotizacion: null,
        estado: 'REGISTRADO',
        lineas: [
          { idProducto: a, codigo: 'A', tipoProducto: 'SERVICIO', cantidad: '1', precio: '6000', idRequerimientoDetalle: null },
          { idProducto: b, codigo: 'B', tipoProducto: 'SERVICIO', cantidad: '1', precio: '4000', idRequerimientoDetalle: null },
        ],
      });
      return doc.id;
    });
  };

  const detalle = async () => (await api().get(`/valorizaciones/contratos/${idContrato}`).expect(200)).body;
  const avances = (a: number, b: number) => [
    { id_orden_detalle: lineaA, avance_pct: a },
    { id_orden_detalle: lineaB, avance_pct: b },
  ];

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    await crearUsuarioE2E(db);
    proveedor = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Proveedor', 'E2E-VAL Contratista', true) returning id`)).rows[0].id;
    const cliente = (await db.query(`insert into anexos ("tipoAnexo", "Anexo", estado) values ('Cliente', 'E2E-VAL Cliente', true) returning id`)).rows[0].id;
    cuenta = (await db.query(`insert into cuenta_tesoreria (codigo, nombre, tipo, moneda_id) values ('E2E-VAL-CTA', 'E2E VAL CUENTA', 'BANCO', 'PEN') returning id`)).rows[0].id;
    cc = (
      await db.query(`insert into "CentroCostos" (centro_costo, estado, fecha_inicio, fecha_fin_prog, periodo, id_anexo) values ('E2E-VAL-OBRA', 'ABIERTO', $1, $1, 2026, $2) returning id`, [hoy, cliente])
    ).rows[0].id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    idOs = await crearOs();
    const lineas = (await db.query(`select id from "ordenCompraDetalle" where id_orden_compra = $1 order by id`, [idOs])).rows as Array<{ id: number }>;
    lineaA = lineas[0].id;
    lineaB = lineas[1].id;
  });

  afterAll(async () => {
    const ordenes = `(select id from "documentosOrigen" where comentarios like 'E2E-VAL%')`;
    await db.query(`delete from pago where id_documento_origen in ${ordenes}`);
    await db.query(`delete from pago_programado where id_documento_origen in ${ordenes}`);
    await db.query(`delete from cuenta_tesoreria where codigo = 'E2E-VAL-CTA'`);
    await db.query(`delete from valorizacion_deductivo where id_valorizacion in (select v.id from valorizacion v join contrato_valorizacion c on c.id = v.id_contrato where c.id_documento_origen in ${ordenes})`);
    await db.query(`delete from valorizacion_linea where id_valorizacion in (select v.id from valorizacion v join contrato_valorizacion c on c.id = v.id_contrato where c.id_documento_origen in ${ordenes})`);
    await db.query(`delete from valorizacion where id_contrato in (select id from contrato_valorizacion where id_documento_origen in ${ordenes})`);
    await db.query(`delete from deductivo_proveedor where id_documento_origen in ${ordenes}`);
    await db.query(`delete from almacen_documento where id_centro_costo = $1`, [cc]);
    await db.query(`delete from contrato_valorizacion where id_documento_origen in ${ordenes}`);
    await db.query(`delete from "ordenCompraDetalle" where id_orden_compra in ${ordenes}`);
    await db.query(`delete from "documentosOrigen" where comentarios like 'E2E-VAL%'`);
    await db.query(`delete from producto where codigo like 'ZZ-VAL-%'`);
    await db.query(`delete from "CentroCostos" where centro_costo like 'E2E-VAL-%'`);
    await db.query(`delete from anexos where "Anexo" like 'E2E-VAL %'`);
    await borrarUsuarioE2E(db);
    await db.end();
    await app.close();
  });

  it('crea el contrato con las condiciones por defecto y no admite uno segundo', async () => {
    const r = (await api().post('/valorizaciones/contratos').send({ id_documento_origen: idOs }).expect(201)).body;
    idContrato = r.contrato.id;
    expect(r.contrato.estado).toBe('BORRADOR');
    expect(r.orden.total).toBe('11800.00');
    expect(r.contrato.numero_valorizaciones).toBeGreaterThanOrEqual(1);
    await api().post('/valorizaciones/contratos').send({ id_documento_origen: idOs }).expect(409);
  });

  it('fija las condiciones: 15 % de adelanto, 10 % de garantía, 3 valorizaciones', async () => {
    const r = (await api().patch(`/valorizaciones/contratos/${idContrato}`).send({ adelanto_porcentaje: 15, garantia_porcentaje: 10, numero_valorizaciones: 3, meses_garantia: 3 }).expect(200)).body;
    expect(num(r.contrato.adelanto_porcentaje)).toBe(15);
    expect(r.contrato.numero_valorizaciones).toBe(3);
  });

  it('sin los dos vistos no se valoriza; con ambos queda vigente y libera el adelanto', async () => {
    await api().post(`/valorizaciones/contratos/${idContrato}/cuotas`).send({ fecha_corte: hoy }).expect(409);
    const op = (await api().post(`/valorizaciones/contratos/${idContrato}/visto-operaciones`).expect(200)).body;
    expect(op.contrato.estado).toBe('BORRADOR');
    await api().post(`/valorizaciones/contratos/${idContrato}/visto-operaciones`).expect(409);
    const ad = (await api().post(`/valorizaciones/administracion/contratos/${idContrato}/visto`).expect(200)).body;
    expect(ad.contrato.estado).toBe('VIGENTE');
    const adelanto = ad.cuotas.find((c: { tipo: string }) => c.tipo === 'ADELANTO');
    expect(adelanto.estado).toBe('APROBADA');
    expect(num(adelanto.facturable)).toBeCloseTo(1770, 2); // 15 % de 11 800
  });

  it('un cambio económico con el contrato vigente y sin valorizaciones lo devuelve a borrador (sin vistos)', async () => {
    const r = (await api().patch(`/valorizaciones/contratos/${idContrato}`).send({ numero_valorizaciones: 2 }).expect(200)).body;
    expect(r.contrato.estado).toBe('BORRADOR');
    expect(r.contrato.visto_operaciones_en).toBeNull();
    await api().patch(`/valorizaciones/contratos/${idContrato}`).send({ numero_valorizaciones: 3 }).expect(200);
    await api().post(`/valorizaciones/contratos/${idContrato}/visto-operaciones`).expect(200);
    const ad = (await api().post(`/valorizaciones/administracion/contratos/${idContrato}/visto`).expect(200)).body;
    expect(ad.contrato.estado).toBe('VIGENTE');
    expect(ad.cuotas.filter((c: { tipo: string; estado: string }) => c.tipo === 'ADELANTO' && c.estado === 'APROBADA')).toHaveLength(1);
  });

  it('Tesorería: un contrato sin vistos no se programa; con vistos solo se paga lo aprobado, ligado a su cuota', async () => {
    // Otra orden con contrato en borrador: ni programar ni pagar.
    const sinVistos = await crearOs();
    await api().post('/valorizaciones/contratos').send({ id_documento_origen: sinVistos }).expect(201);
    const bloqueado = await api()
      .post('/tesoreria/programacion')
      .send({ items: [{ id_documento_origen: sinVistos, fecha_programada: '2026-12-04', monto: '100.00', medio_pago: 'TRANSFERENCIA', urgente: true, observaciones: 'PRUEBA E2E' }] });
    expect(bloqueado.status).toBe(409);
    expect(bloqueado.body.codigo).toBe('CONTRATO_SIN_VISTOS');

    // La orden vigente: solo está aprobado el adelanto.
    const d = await detalle();
    const adelanto = d.cuotas.find((c: { tipo: string }) => c.tipo === 'ADELANTO');
    const neto = num(adelanto.neto);
    expect(neto).toBeGreaterThan(0);
    const sobre = await api()
      .post('/tesoreria/programacion')
      .send({ items: [{ id_documento_origen: idOs, fecha_programada: '2026-12-04', monto: (neto + 1).toFixed(2), medio_pago: 'TRANSFERENCIA', urgente: true, observaciones: 'PRUEBA E2E' }] });
    expect(sobre.status).toBe(409);
    expect(sobre.body.codigo).toBe('NO_LIBERADO');
    // No admite «por encima del avance».
    await api()
      .post('/tesoreria/programacion')
      .send({ items: [{ id_documento_origen: idOs, fecha_programada: '2026-12-04', monto: '10.00', medio_pago: 'TRANSFERENCIA', urgente: true, observaciones: 'PRUEBA E2E', exceder_avance: true }] })
      .expect(400);
    // Una cuota que no es del contrato.
    await api()
      .post('/tesoreria/programacion')
      .send({ items: [{ id_documento_origen: idOs, fecha_programada: '2026-12-04', monto: '10.00', medio_pago: 'TRANSFERENCIA', urgente: true, observaciones: 'PRUEBA E2E', id_valorizacion: 99999999 }] })
      .expect(409);

    // Se programa y paga justo el adelanto, ligado a su cuota.
    const prog = (
      await api()
        .post('/tesoreria/programacion')
        .send({ items: [{ id_documento_origen: idOs, fecha_programada: '2026-12-04', monto: neto.toFixed(2), medio_pago: 'TRANSFERENCIA', urgente: true, observaciones: 'PRUEBA E2E', id_valorizacion: adelanto.id }] })
        .expect(201)
    ).body[0];
    expect(prog.id_valorizacion).toBe(adelanto.id);
    expect(prog.cuota_tipo).toBe('ADELANTO');
    await api()
      .post('/tesoreria/pagos')
      .send({ id_pago_programado: prog.id, fecha_pago: '2026-12-04', id_cuenta: cuenta, medio_pago: 'TRANSFERENCIA', numero_operacion: 'E2E-VAL' })
      .expect(201);
    const pagado = await detalle();
    const cuotaAdelanto = pagado.cuotas.find((c: { tipo: string }) => c.tipo === 'ADELANTO');
    expect(cuotaAdelanto.estado_pago).toBe('PAGADA');
    expect(num(cuotaAdelanto.saldo)).toBe(0);
    // Nada más liberado: un pago directo adicional se rechaza.
    const mas = await api().post('/tesoreria/pagos/directo').send({ id_documento_origen: idOs, fecha_pago: '2026-12-04', monto: '50.00', medio_pago: 'TRANSFERENCIA', id_cuenta: cuenta, numero_operacion: 'E2E-VAL-2' });
    expect(mas.status).toBe(409);
    expect(mas.body.codigo).toBe('NO_LIBERADO');
    // Con pagos, lo económico del contrato ya no cambia.
    await api().patch(`/valorizaciones/contratos/${idContrato}`).send({ numero_valorizaciones: 2 }).expect(409);
    // La orden sin vistos se anula y su contrato también.
    await api().post(`/administracion/documentos-origen/${sinVistos}/anular`).send({ motivo: 'Prueba' }).expect(200);
  });

  it('un deductivo por monto queda pendiente y se descuenta en la primera valorización', async () => {
    const d = (await api().post(`/valorizaciones/contratos/${idContrato}/deductivos`).send({ motivo: 'PENALIDAD', fecha: hoy, descripcion: 'Penalidad de prueba', monto: 100 }).expect(201)).body;
    expect(d.estado).toBe('PENDIENTE');
    expect(num(d.pendiente)).toBe(100);
    await api().post(`/valorizaciones/contratos/${idContrato}/deductivos`).send({ motivo: 'PENALIDAD', fecha: hoy, descripcion: 'Sin monto' }).expect(400);
  });

  it('un deductivo por material sale de una PECOSA de la obra, no pasa de lo entregado y bloquea anular la salida', async () => {
    const almacen = (await db.query(`select id from almacen order by id limit 1`)).rows[0].id as number;
    const producto = (await db.query(`select id from producto where codigo like 'ZZ-VAL-%' order by id limit 1`)).rows[0].id as number;
    const doc = (
      await db.query(
        `insert into almacen_documento (numero, naturaleza, motivo, fecha, id_almacen, id_centro_costo, estado) values ('E2E-VAL-S1', 'SALIDA', 'CONSUMO', $1, $2, $3, 'REGISTRADO') returning id`,
        [hoy, almacen, cc],
      )
    ).rows[0].id as number;
    const det = (await db.query(`insert into almacen_documento_detalle (id_documento, id_producto, cantidad, costo_unitario) values ($1, $2, 10, 25) returning id`, [doc, producto])).rows[0].id as number;

    const materiales = (await api().get(`/valorizaciones/contratos/${idContrato}/materiales`).expect(200)).body;
    expect(materiales.find((m: { id_almacen_detalle: number }) => m.id_almacen_detalle === det).saldo).toBe('10');
    await api().post(`/valorizaciones/contratos/${idContrato}/deductivos`).send({ motivo: 'MATERIAL', fecha: hoy, descripcion: 'Material de más', id_almacen_detalle: det, cantidad: 11 }).expect(409);
    await api().post(`/valorizaciones/contratos/${idContrato}/deductivos`).send({ motivo: 'MATERIAL', fecha: hoy, descripcion: 'Sin línea' }).expect(400);
    const d = (await api().post(`/valorizaciones/contratos/${idContrato}/deductivos`).send({ motivo: 'MATERIAL', fecha: hoy, descripcion: 'Material entregado', id_almacen_detalle: det, cantidad: 4 }).expect(201)).body;
    expect(num(d.monto)).toBe(100); // 4 × 25
    const despues = (await api().get(`/valorizaciones/contratos/${idContrato}/materiales`).expect(200)).body;
    expect(despues.find((m: { id_almacen_detalle: number }) => m.id_almacen_detalle === det).saldo).toBe('6');

    await api().post(`/almacen/salidas/${doc}/anular`).expect(409);
    // Anulado el deductivo, la línea vuelve a estar libre.
    await api().post(`/valorizaciones/deductivos/${d.id}/anular`).send({ motivo: 'Prueba' }).expect(200);
    const libre = (await api().get(`/valorizaciones/contratos/${idContrato}/materiales`).expect(200)).body;
    expect(libre.find((m: { id_almacen_detalle: number }) => m.id_almacen_detalle === det).saldo).toBe('10');
  });

  it('primera valorización: avance manual, deductivo descontado y borrador editable', async () => {
    const b = (await api().post(`/valorizaciones/contratos/${idContrato}/cuotas`).send({ fecha_corte: hoy, lineas: avances(60, 30) }).expect(201)).body;
    expect(b.estado).toBe('BORRADOR');
    expect(b.numero).toBe(1);
    expect(num(b.cuota.valorizado)).toBeGreaterThan(0);
    expect(num(b.cuota.descuentos)).toBe(100);
    expect(num(b.cuota.neto)).toBeGreaterThanOrEqual(0);
    expect(b.deductivos).toHaveLength(1);
    const abierto = (await api().get(`/operaciones/obra/${cc}/liquidacion`).expect(200)).body;
    expect(abierto.requisitos.find((r: { codigo: string }) => r.codigo === 'VALORIZACIONES')).toMatchObject({ cumplido: false });
    await api().post(`/valorizaciones/contratos/${idContrato}/cuotas`).send({ fecha_corte: hoy }).expect(409); // ya hay un borrador

    // Corte futuro: rechazado.
    await api().patch(`/valorizaciones/cuotas/${b.id}`).send({ fecha_corte: '2999-01-01' }).expect(400);
    // Sin descontar el deductivo: neto mayor.
    const sin = (await api().patch(`/valorizaciones/cuotas/${b.id}`).send({ deductivos: [] }).expect(200)).body;
    expect(num(sin.cuota.descuentos)).toBe(0);
    const con = (await api().patch(`/valorizaciones/cuotas/${b.id}`).send({ deductivos: b.deductivos.map((x: { id: number }) => x.id) }).expect(200)).body;
    expect(num(con.cuota.descuentos)).toBe(100);

    const ok = (await api().post(`/valorizaciones/cuotas/${b.id}/aprobar`).expect(200)).body;
    expect(ok.estado).toBe('APROBADA');
    expect(ok.numero_documento).toMatch(/^VAL-\d+$/);
    expect(ok.lineas.reduce((a: number, l: { monto_presente: string }) => a + num(l.monto_presente), 0)).toBeCloseTo(num(ok.cuota.valorizado), 2);
    await api().post(`/valorizaciones/cuotas/${b.id}/aprobar`).expect(409);
    await api().patch(`/valorizaciones/cuotas/${b.id}`).send({ observaciones: 'x' }).expect(409);

    const lista = (await api().get(`/valorizaciones/contratos/${idContrato}/deductivos`).expect(200)).body;
    expect(lista[0].estado).toBe('APLICADO');
    await api().post(`/valorizaciones/deductivos/${lista[0].id}/anular`).send({ motivo: 'Prueba' }).expect(409);
  });

  it('un monto distinto del sugerido exige motivo para aprobar', async () => {
    const b = (await api().post(`/valorizaciones/contratos/${idContrato}/cuotas`).send({ fecha_corte: hoy, lineas: avances(80, 70), valorizado: 1 }).expect(201)).body;
    expect(b.origen_monto).toBe('SUPERVISOR');
    await api().post(`/valorizaciones/cuotas/${b.id}/aprobar`).expect(400);
    await api().patch(`/valorizaciones/cuotas/${b.id}`).send({ motivo_monto: 'Acuerdo con el contratista' }).expect(200);
    const ok = (await api().post(`/valorizaciones/cuotas/${b.id}/aprobar`).expect(200)).body;
    expect(ok.estado).toBe('APROBADA');
    expect(num(ok.cuota.valorizado)).toBe(1);
  });

  it('anular la última valorización aprobada libera el cálculo; solo la última se anula', async () => {
    const d = await detalle();
    const aprobadas = d.cuotas.filter((c: { tipo: string; estado: string }) => c.tipo === 'VALORIZACION' && c.estado === 'APROBADA');
    expect(aprobadas).toHaveLength(2);
    await api().post(`/valorizaciones/cuotas/${aprobadas[0].id}/anular`).send({ motivo: 'No es la última' }).expect(409);
    await api().post(`/valorizaciones/cuotas/${aprobadas[1].id}/anular`).send({ motivo: 'Corrección de prueba' }).expect((r) => { if (r.status !== 200) throw new Error(JSON.stringify(r.body)); });
    const despues = await detalle();
    expect(despues.cuotas.filter((c: { tipo: string; estado: string }) => c.tipo === 'VALORIZACION' && c.estado === 'APROBADA')).toHaveLength(1);
  });

  it('el contrato muestra el tope de consumo y el control de facturas, que se llena al anotar cada factura', async () => {
    const d = await detalle();
    const v1 = d.cuotas.find((c: { tipo: string; estado: string }) => c.tipo === 'VALORIZACION' && c.estado === 'APROBADA');
    const adelanto = d.cuotas.find((c: { tipo: string }) => c.tipo === 'ADELANTO');
    // Tope = 11 800 − 10 % de garantía; lo consumido es lo valorizado (la penalidad no consume contrato).
    expect(d.tope.tope).toBe('10620.00');
    expect(num(d.tope.consumido)).toBeCloseTo(num(v1.valorizado), 2);
    expect(num(d.tope.saldo_hasta_tope)).toBeCloseTo(10620 - num(v1.valorizado), 2);
    expect(d.tope.exceso).toBe('0.00');
    expect(['DENTRO', 'CERCA']).toContain(d.tope.estado);
    const lista = (await api().get('/valorizaciones/contratos').query({ id_centro_costo: cc, estado: 'VIGENTE' }).expect(200)).body;
    expect(lista.data[0].tope).toBe('10620.00');
    expect(lista.data[0].cuotas_sin_factura).toBe(2);

    // Facturas: ninguna anotada y la última cuota ya tiene una anterior sin factura = atrasado.
    expect(d.facturas.estado).toBe('ATRASADO');
    expect(d.facturas.filas).toHaveLength(2);
    const f1 = (await api().patch(`/valorizaciones/administracion/cuotas/${adelanto.id}/factura`).send({ factura_numero: 'F001-1', factura_fecha: hoy }).expect(200)).body;
    expect(f1.factura.numero).toBe('F001-1');
    expect((await detalle()).facturas.estado).toBe('FALTA_ACTUAL');
    await api().patch(`/valorizaciones/administracion/cuotas/${v1.id}/factura`).send({ factura_numero: 'F001-2' }).expect(200);
    const al = (await detalle()).facturas;
    expect(al.estado).toBe('AL_DIA');
    expect(al.pendiente).toBe('0.00');
    expect(al.valorizado).toBe(al.facturado);
    await api().patch(`/valorizaciones/administracion/cuotas/${v1.id}/factura`).send({}).expect(400);
    await api().patch('/valorizaciones/administracion/cuotas/99999999/factura').send({ factura_numero: 'F001-3' }).expect(404);
  });

  it('la orden con valorizaciones aprobadas no se anula ni cambia sus montos', async () => {
    await api().post(`/administracion/documentos-origen/${idOs}/anular`).send({ motivo: 'Prueba' }).expect(409);
    await api().patch(`/administracion/documentos-origen/${idOs}/deducciones`).send({ renta_4ta: 10 }).expect(409);
    await api().delete(`/documentos/origen/${idOs}`).expect(409);
  });

  it('la última cuota toma todo lo pendiente y liquida el contrato; luego se devuelve la garantía', async () => {
    const dos = (await api().post(`/valorizaciones/contratos/${idContrato}/cuotas`).send({ fecha_corte: hoy, lineas: avances(90, 90) }).expect(201)).body;
    expect(dos.numero).toBe(2);
    // El reajuste (R) se suma al neto sin tocar lo valorizado.
    const conR = (await api().patch(`/valorizaciones/cuotas/${dos.id}`).send({ reajuste: 25.5 }).expect(200)).body;
    expect(num(conR.cuota.reajuste)).toBe(25.5);
    expect(num(conR.cuota.neto)).toBeCloseTo(num(dos.cuota.neto) + 25.5, 2);
    expect(conR.cuota.valorizado).toBe(dos.cuota.valorizado);
    const aprobadaR = (await api().post(`/valorizaciones/cuotas/${dos.id}/aprobar`).expect(200)).body;
    expect(num(aprobadaR.cuota.reajuste)).toBe(25.5);
    // Con la cuota aprobada el reajuste ya no se cambia.
    await api().patch(`/valorizaciones/cuotas/${dos.id}`).send({ reajuste: 1 }).expect(409);

    const tres = (await api().post(`/valorizaciones/contratos/${idContrato}/cuotas`).send({ fecha_corte: hoy, lineas: avances(100, 100) }).expect(201)).body;
    expect(tres.numero).toBe(3);
    expect(tres.es_ultima).toBe(true);
    await api().post(`/valorizaciones/cuotas/${tres.id}/aprobar`).expect(200);

    const fin = await detalle();
    expect(fin.contrato.estado).toBe('LIQUIDADO');
    const valorizado = fin.cuotas.filter((c: { tipo: string; estado: string }) => c.tipo === 'VALORIZACION' && c.estado === 'APROBADA').reduce((a: number, c: { valorizado: string }) => a + num(c.valorizado), 0);
    // Entre las tres valorizaciones se reparte todo el monto bruto de la orden; el adelanto se amortiza dentro de ellas, no se suma.
    expect(valorizado).toBeCloseTo(11800, 2);
    const amortizado = fin.cuotas.filter((c: { tipo: string; estado: string }) => c.tipo === 'VALORIZACION' && c.estado === 'APROBADA').reduce((a: number, c: { amortizacion: string }) => a + num(c.amortizacion), 0);
    expect(amortizado).toBeCloseTo(1770, 2);
    expect(num(fin.garantia.retenida)).toBeGreaterThan(0);
    const liquidacion = (await api().get(`/operaciones/obra/${cc}/liquidacion`).expect(200)).body;
    expect(liquidacion.requisitos.find((r: { codigo: string }) => r.codigo === 'VALORIZACIONES')).toMatchObject({ cumplido: true });
    const garantias = (await api().get('/valorizaciones/garantias').expect(200)).body;
    const g = garantias.find((x: { id_contrato: number }) => x.id_contrato === idContrato);
    expect(g).toMatchObject({ devolvible: true, vencida: false });
    expect(num(g.retenida)).toBeCloseTo(num(fin.garantia.retenida), 2);
    expect(g.vence > hoy).toBe(true);
    await api().post(`/valorizaciones/cuotas/${tres.id}/aprobar`).expect(409);
    await api().post(`/valorizaciones/contratos/${idContrato}/cuotas`).send({ fecha_corte: hoy }).expect(409);

    // La garantía vence a los 3 meses: antes hace falta el motivo.
    await api().post(`/valorizaciones/administracion/contratos/${idContrato}/devolver-garantia`).send({}).expect(409);
    const dev = (await api().post(`/valorizaciones/administracion/contratos/${idContrato}/devolver-garantia`).send({ motivo: 'Acuerdo de prueba' }).expect(200)).body;
    expect(dev.cuotas.some((c: { tipo: string; estado: string }) => c.tipo === 'GARANTIA' && c.estado === 'APROBADA')).toBe(true);
    expect(num(dev.garantia.retenida)).toBeCloseTo(0, 2);
    const despues = (await api().get('/valorizaciones/garantias').expect(200)).body;
    expect(despues.find((x: { id_contrato: number }) => x.id_contrato === idContrato)).toBeUndefined();
    await api().post(`/valorizaciones/administracion/contratos/${idContrato}/devolver-garantia`).send({ motivo: 'Otra vez' }).expect(409);
  });

  it('el listado y la consulta por cliente reflejan el contrato', async () => {
    const lista = (await api().get('/valorizaciones/contratos').query({ id_centro_costo: cc, estado: 'LIQUIDADO' }).expect(200)).body;
    expect(lista.data).toHaveLength(1);
    expect(lista.data[0].estado).toBe('LIQUIDADO');
    expect(lista.data[0].estado_tope).toBe('LIQUIDADO');
    expect(lista.data[0].cuotas_sin_factura).toBe(2); // el adelanto y la valorización 1 se facturaron; faltan la 2 y la 3
    const consulta = (await api().get('/valorizaciones/consulta').query({ agrupar: 'obra', id_centro_costo: cc }).expect(200)).body;
    expect(consulta.filas).toHaveLength(1);
    expect(num(consulta.filas[0].contratado)).toBe(11800);
  });

  it('el alta automática solo crea contratos con VALORIZACIONES_ALTA=automatica', async () => {
    const database = app.get<Database>(DB);
    const sql = app.get(AlmacenSql);
    const otra = await crearOs();
    const previo = process.env['VALORIZACIONES_ALTA'];
    try {
      process.env['VALORIZACIONES_ALTA'] = 'manual';
      expect(await database.transaction((tx) => altaAutomaticaDeOrdenes(sql, tx, [otra], 'E2E'))).toBe(0);
      process.env['VALORIZACIONES_ALTA'] = 'automatica';
      expect(await database.transaction((tx) => altaAutomaticaDeOrdenes(sql, tx, [otra], 'E2E'))).toBe(1);
      expect(await database.transaction((tx) => altaAutomaticaDeOrdenes(sql, tx, [otra], 'E2E'))).toBe(0); // idempotente
    } finally {
      if (previo === undefined) delete process.env['VALORIZACIONES_ALTA'];
      else process.env['VALORIZACIONES_ALTA'] = previo;
    }
    const lista = (await api().get('/valorizaciones/contratos').query({ id_centro_costo: cc, estado: 'BORRADOR' }).expect(200)).body;
    expect(lista.data).toHaveLength(1);
    expect(lista.data[0].id_documento_origen).toBe(otra);
    // Anular la orden anula su contrato (sin valorizaciones aprobadas).
    await api().post(`/administracion/documentos-origen/${otra}/anular`).send({ motivo: 'Prueba' }).expect(200);
    const anulado = (await api().get('/valorizaciones/contratos').query({ id_centro_costo: cc, estado: 'ANULADO' }).expect(200)).body;
    expect(anulado.data).toHaveLength(2); // la orden sin vistos de Tesorería y esta
  });

  it('las condiciones por tipo de servicio se listan y editan', async () => {
    const lista = (await api().get('/valorizaciones/administracion/condiciones').expect(200)).body;
    expect(Array.isArray(lista)).toBe(true);
    const general = lista.find((c: { id_categoria: number | null }) => c.id_categoria === null);
    expect(general).toBeDefined();
    await api().post('/valorizaciones/administracion/condiciones').send({ adelanto_porcentaje: 10, garantia_porcentaje: 5, numero_valorizaciones: 2, meses_garantia: 1 }).expect(409);
  });

  it('el descuento fijo del tipo de servicio se carga como deductivo solo si la obra está fuera de Lima Metropolitana', async () => {
    const categoria = (await db.query(`select id from categoria order by id limit 1`)).rows[0].id as number;
    const lista = (await api().get('/valorizaciones/administracion/condiciones').expect(200)).body as Array<{ id: number; id_categoria: number | null; descuento_fuera_lima: number }>;
    let propia = lista.find((c) => c.id_categoria === categoria);
    let creada = false;
    if (!propia) {
      const nueva = (await api().post('/valorizaciones/administracion/condiciones').send({ id_categoria: categoria, adelanto_porcentaje: 15, garantia_porcentaje: 10, numero_valorizaciones: 3, meses_garantia: 3 }).expect(201)).body;
      propia = nueva;
      creada = true;
    }
    const original = propia!.descuento_fuera_lima;
    try {
      const editada = (await api().patch(`/valorizaciones/administracion/condiciones/${propia!.id}`).send({ descuento_fuera_lima: 150 }).expect(200)).body;
      expect(editada.descuento_fuera_lima).toBe(150);
      await api().patch(`/valorizaciones/administracion/condiciones/${propia!.id}`).send({ descuento_fuera_lima: -1 }).expect(400);
      const distrito = async (enLima: boolean) =>
        (await db.query(`select id from distrito where ${enLima ? "id_provincia = '1501'" : "id_provincia <> '1501'"} order by id limit 1`)).rows[0].id as string;
      const conObra = async (id_distrito: string | null) => {
        await db.query(`delete from obra_datos_generales where id_centro_costo = $1`, [cc]);
        if (id_distrito) await db.query(`insert into obra_datos_generales (id_centro_costo, id_distrito) values ($1, $2)`, [cc, id_distrito]);
      };
      const deductivosDe = async (idc: number) => (await api().get(`/valorizaciones/contratos/${idc}/deductivos`).expect(200)).body as Array<{ motivo: string; monto: string; estado: string; descripcion: string }>;

      // En Lima Metropolitana no se descuenta nada.
      await conObra(await distrito(true));
      const enLima = (await api().post('/valorizaciones/contratos').send({ id_documento_origen: await crearOs() }).expect(201)).body.contrato.id as number;
      expect(await deductivosDe(enLima)).toHaveLength(0);
      // Sin distrito en la ficha tampoco: no se sabe dónde está.
      await conObra(null);
      const sinDato = (await api().post('/valorizaciones/contratos').send({ id_documento_origen: await crearOs() }).expect(201)).body.contrato.id as number;
      expect(await deductivosDe(sinDato)).toHaveLength(0);
      // Fuera de Lima: el deductivo queda pendiente por el monto fijo.
      await conObra(await distrito(false));
      const fuera = (await api().post('/valorizaciones/contratos').send({ id_documento_origen: await crearOs() }).expect(201)).body.contrato.id as number;
      const ded = await deductivosDe(fuera);
      expect(ded).toHaveLength(1);
      expect(ded[0]).toMatchObject({ motivo: 'OTRO', estado: 'PENDIENTE' });
      expect(num(ded[0].monto)).toBe(150);
      expect(ded[0].descripcion).toContain('FUERA DE LIMA');
    } finally {
      if (creada) await db.query(`delete from condicion_servicio where id = $1`, [propia!.id]);
      else await api().patch(`/valorizaciones/administracion/condiciones/${propia!.id}`).send({ descuento_fuera_lima: original });
    }
  });
});
