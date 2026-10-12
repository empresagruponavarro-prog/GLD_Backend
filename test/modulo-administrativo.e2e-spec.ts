import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import 'dotenv/config';
import pg from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

/**
 * Modulo administrativo contra la BD de DATABASE_URL (plan 06):
 * FUR -> cotizaciones -> aprobacion con ganador -> OC/OS -> recepcion -> programacion (viernes) -> pagos.
 * Crea sus propios proveedores (ZZ-ADM), productos, cuentas y tipo de cambio, y los elimina al final.
 */
describe('Módulo administrativo: cotizaciones, documentos de origen y pagos (e2e)', () => {
  let app: INestApplication<App>;
  let db: pg.Client;
  let trabajadores: number[] = [];
  let provA = 0;
  let provB = 0;
  let centroCostoId = 0;
  let productoId = 0;
  let servicioId = 0;
  let conceptoPlanilla = 0;
  let conceptoCaja = 0;
  let cuentaPen = 0;
  let cuentaUsd = 0;
  const requerimientoIds: number[] = [];
  const documentoIds: number[] = [];

  const api = () => request(app.getHttpServer());
  const num = (v: string | number) => Number(v);
  const VIERNES = '2026-10-16';
  const MIERCOLES = '2026-10-14';
  const VIERNES_2 = '2026-10-23';

  async function crearAnexo(nombre: string): Promise<number> {
    const r = await db.query(
      `insert into anexos ("tipoAnexo", "Anexo", "NombreComercial") values ('Proveedor', $1, $1) returning id`,
      [nombre],
    );
    return r.rows[0].id;
  }

  async function crearItem(tipo: 'PRODUCTO' | 'SERVICIO'): Promise<number> {
    const r = await db.query(
      `insert into producto (codigo, descripcion, id_categoria, id_unidad_medida, tipo_producto)
       values ($1, $2, 1, 1, $3) returning id`,
      [`ZZ-ADM-${Math.random().toString(36).slice(2, 8)}`, `${tipo} DE PRUEBA ADM`, tipo],
    );
    return r.rows[0].id;
  }

  async function crearFur(lineas: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
    const res = await api()
      .post('/requerimientos')
      .send({
        fecha: '2026-10-10',
        id_centro_costo: centroCostoId,
        id_solicitante: trabajadores[0],
        justificacion: 'Prueba e2e del módulo administrativo',
        lineas,
        ...extra,
      });
    if (res.status === 201) requerimientoIds.push(res.body.id);
    return res;
  }

  const cotizacionBody = (proveedor: number, fur: { lineas: Array<{ id: number; id_producto: number }> }, precios: Record<number, string>, extra: Record<string, unknown> = {}) => ({
    id_proveedor: proveedor,
    fecha: '2026-10-11',
    moneda_id: 'PEN',
    moneda_simbolo: 'S/',
    forma_pago: 'Credito 15 dias',
    dias_credito: 15,
    medio_pago: 'TRANSFERENCIA',
    plazo_entrega_dias: 0,
    lineas: fur.lineas.map((l) => ({
      id_requerimiento_detalle: l.id,
      cantidad: l.id_producto === productoId ? '10' : '1',
      precio_unitario: precios[l.id_producto],
    })),
    ...extra,
  });

  async function documentosDe(idFur: number) {
    const res = await api().get('/administracion/documentos-origen').query({ id_requerimiento: idFur }).expect(200);
    return res.body.data as Array<Record<string, any>>;
  }

  beforeAll(async () => {
    db = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
    await db.connect();
    trabajadores = (await db.query(`select id from anexos where "tipoAnexo" = 'Trabajador' order by id limit 2`)).rows.map((r) => r.id);
    centroCostoId = (await db.query(`select id from "CentroCostos" limit 1`)).rows[0].id;
    provA = await crearAnexo('ZZ-ADM PROVEEDOR A');
    provB = await crearAnexo('ZZ-ADM PROVEEDOR B');
    productoId = await crearItem('PRODUCTO');
    servicioId = await crearItem('SERVICIO');
    conceptoPlanilla = (await db.query(`select id from producto where codigo = 'CONC-PLANILLA-PERSONAL'`)).rows[0].id;
    conceptoCaja = (await db.query(`select id from producto where codigo = 'CONC-CAJA-CHICA'`)).rows[0].id;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    cuentaPen = (await api().post('/tesoreria/cuentas').send({ codigo: 'ZZ-ADM-PEN', nombre: 'Cuenta PEN de prueba', tipo: 'BANCO', moneda_id: 'PEN' }).expect(201)).body.id;
    cuentaUsd = (await api().post('/tesoreria/cuentas').send({ codigo: 'ZZ-ADM-USD', nombre: 'Cuenta USD de prueba', tipo: 'BANCO', moneda_id: 'USD' }).expect(201)).body.id;
  });

  afterAll(async () => {
    const furIds = requerimientoIds;
    if (furIds.length > 0) {
      const generados = (await db.query('select id from "documentosOrigen" where id_requerimiento = any($1)', [furIds])).rows.map((r) => r.id);
      documentoIds.push(...generados);
    }
    const docs = [...new Set(documentoIds)];
    const productos = [productoId, servicioId].filter(Boolean);
    if (productos.length > 0) {
      const almDocs = (await db.query('select distinct id_documento from almacen_documento_detalle where id_producto = any($1)', [productos])).rows.map((x) => x.id_documento);
      await db.query('delete from almacen_kardex where id_producto = any($1)', [productos]);
      await db.query('delete from almacen_documento_detalle where id_producto = any($1)', [productos]);
      await db.query('update almacen_documento set id_documento_anula = null where id_documento_anula = any($1)', [almDocs]);
      await db.query('delete from almacen_documento where id = any($1)', [almDocs]);
      await db.query('delete from stock_almacen where id_producto = any($1)', [productos]);
    }
    if (docs.length > 0) {
      await db.query('delete from pago where id_documento_origen = any($1)', [docs]);
      await db.query('delete from pago_programado where id_documento_origen = any($1)', [docs]);
      await db.query('delete from "ordenCompraDetalle" where id_orden_compra = any($1)', [docs]);
      await db.query('delete from "documentosOrigen" where id = any($1)', [docs]);
    }
    if (furIds.length > 0) {
      await db.query('update requerimiento set id_cotizacion_ganadora = null where id = any($1)', [furIds]);
      await db.query('delete from cotizacion where id_requerimiento = any($1)', [furIds]);
      await db.query('delete from requerimiento where id = any($1)', [furIds]);
    }
    await db.query(`delete from cuenta_tesoreria where codigo like 'ZZ-ADM-%'`);
    await db.query(`delete from tipo_cambio_diario where moneda_id = 'USD' and fecha = $1`, [VIERNES]);
    if (productos.length > 0) await db.query('delete from producto where id = any($1)', [productos]);
    await db.query('delete from anexos where id = any($1)', [[provA, provB]]);
    await db.end();
    await app?.close();
  });

  it('recorre FUR -> cotizaciones -> ganador -> OC/OS -> recepción -> programación -> pagos', async () => {
    // ---------------------------------------------------------------- FUR y cotizaciones
    const crear = await crearFur([
      { id_producto: productoId, cantidad: '10' },
      { id_producto: servicioId, cantidad: '1' },
    ]);
    expect(crear.status).toBe(201);
    const fur = crear.body;
    expect(fur.tipo).toBe('COMPRA');
    await api().post(`/requerimientos/${fur.id}/cerrar-cotizacion`).send({}).expect(409); // aún en BORRADOR
    await api().post(`/requerimientos/${fur.id}/enviar`).send({}).expect(200);

    // No se cierra sin cotizaciones.
    await api().post(`/requerimientos/${fur.id}/cerrar-cotizacion`).send({}).expect(409);

    // Proveedor A (mas caro, con IGV, 15 dias de credito) y proveedor B (mas barato, no afecto al IGV, precios con IGV incluido).
    const a = await api()
      .post(`/requerimientos/${fur.id}/cotizaciones`)
      .send(cotizacionBody(provA, fur, { [productoId]: '100', [servicioId]: '1000' }))
      .expect(201);
    expect(a.body.numero).toMatch(/^COT-\d{6}$/);
    expect(num(a.body.total_sin_igv)).toBe(2000);
    expect(num(a.body.igv)).toBe(360);
    expect(num(a.body.total)).toBe(2360);

    // Una línea de otro requerimiento no se puede cotizar aquí.
    const otro = await crearFur([{ id_producto: productoId, cantidad: '2' }]);
    await api()
      .post(`/requerimientos/${fur.id}/cotizaciones`)
      .send({
        id_proveedor: provB,
        fecha: '2026-10-11',
        moneda_id: 'PEN',
        forma_pago: 'Contado',
        lineas: [{ id_requerimiento_detalle: otro.body.lineas[0].id, cantidad: '1', precio_unitario: '1' }],
      })
      .expect(400);

    const b = await api()
      .post(`/requerimientos/${fur.id}/cotizaciones`)
      .send(
        cotizacionBody(provB, fur, { [productoId]: '95', [servicioId]: '900' }, {
          afecto_igv: false,
          incluye_igv: true,
          forma_pago: 'Contado',
          dias_credito: 0,
          medio_pago: 'YAPE',
          plazo_entrega_dias: 21,
        }),
      )
      .expect(201);
    expect(num(b.body.igv)).toBe(0); // no afecto: el precio es el precio
    expect(num(b.body.total)).toBe(1850);

    // Validaciones de la cotización.
    await api().post(`/requerimientos/${fur.id}/cotizaciones`).send(cotizacionBody(provA, fur, { [productoId]: '1', [servicioId]: '1' })).expect(409); // proveedor repetido
    await api().post(`/requerimientos/${otro.body.id}/cotizaciones`).send(cotizacionBody(provA, otro.body, { [productoId]: '1' })).expect(409); // el otro FUR sigue en BORRADOR
    await api()
      .post(`/requerimientos/${fur.id}/cotizaciones`)
      .send({ ...cotizacionBody(provB, fur, { [productoId]: '1', [servicioId]: '1' }), id_proveedor: trabajadores[0] })
      .expect(400); // un Trabajador no es proveedor

    // Cuadro comparativo: dos proveedores, sin ganador sugerido.
    const cuadro = (await api().get(`/requerimientos/${fur.id}/cuadro-comparativo`).expect(200)).body;
    expect(cuadro.proveedores).toHaveLength(2);
    expect(cuadro.lineas).toHaveLength(2);
    expect(cuadro.lineas[0].ofertas).toHaveLength(2);
    expect(cuadro.id_cotizacion_ganadora).toBeNull();
    expect(cuadro.proveedores.every((p: { es_ganadora: boolean }) => p.es_ganadora === false)).toBe(true);
    const ofB = cuadro.lineas.find((l: { codigo: string }) => l.codigo.startsWith('ZZ-ADM')).ofertas.find((o: { id_cotizacion: number }) => o.id_cotizacion === b.body.id);
    expect(num(ofB.precio_sin_igv)).toBeGreaterThan(0);

    // Cerrar, no se puede cotizar mas, reabrir y volver a cerrar.
    await api().post(`/requerimientos/${fur.id}/cerrar-cotizacion`).send({}).expect(200);
    await api().post(`/requerimientos/${fur.id}/cotizaciones`).send(cotizacionBody(provB, fur, { [productoId]: '1', [servicioId]: '1' })).expect(409);
    await api().post(`/requerimientos/${fur.id}/reabrir-cotizacion`).send({}).expect(200);
    await api().post(`/requerimientos/${fur.id}/cerrar-cotizacion`).send({}).expect(200);
    await api().patch(`/requerimientos/${fur.id}`).send({ justificacion: 'x' }).expect(409);

    // ---------------------------------------------------------------- aprobación eligiendo al más caro
    await api().post(`/requerimientos/${fur.id}/aprobar`).send({ id_aprobador: trabajadores[0] }).expect(400); // falta el ganador
    const ajena = a.body.id + 987654;
    await api().post(`/requerimientos/${fur.id}/aprobar`).send({ id_aprobador: trabajadores[0], id_cotizacion_ganadora: ajena }).expect(400);
    const aprobado = await api()
      .post(`/requerimientos/${fur.id}/aprobar`)
      .send({ id_aprobador: trabajadores[0], id_cotizacion_ganadora: a.body.id, comentario_adjudicacion: 'Entrega inmediata y crédito' })
      .expect(200);
    expect(aprobado.body.estado).toBe('APROBADO');
    expect(aprobado.body.id_cotizacion_ganadora).toBe(a.body.id);
    expect(aprobado.body.comentario_adjudicacion).toBe('Entrega inmediata y crédito');

    const docs = await documentosDe(fur.id);
    expect(docs).toHaveLength(2);
    const oc = docs.find((d) => d.clase_documento === 'ORDEN_COMPRA')!;
    const os = docs.find((d) => d.clase_documento === 'ORDEN_SERVICIO')!;
    expect(oc.numero_documento).toMatch(/^OC-\d{6}$/);
    expect(os.numero_documento).toMatch(/^OS-\d{6}$/);
    expect(oc.id_anexo).toBe(provA);
    // OC: 10 x 100 + IGV = 1180; retiene 3 % (proveedor no exceptuado, > S/ 700, sin detracción).
    expect(num(oc.total)).toBe(1180);
    expect(num(oc.retencion_monto)).toBeCloseTo(35.4, 2);
    expect(oc.detraccion_monto).toBeNull();
    expect(num(oc.neto_proveedor)).toBeCloseTo(1144.6, 2);
    expect(oc.pendiente_recepcion).toBe(true);
    expect(oc.vencimiento).toBeNull();
    // OS: 1 x 1000 + IGV = 1180; detracción 10 % y por eso sin retención.
    expect(num(os.total)).toBe(1180);
    expect(num(os.detraccion_monto)).toBe(118);
    expect(os.retencion_monto).toBeNull();
    expect(num(os.neto_proveedor)).toBeCloseTo(1062, 2);
    expect(os.estado_pago).toBe('SIN_PROGRAMAR');
    documentoIds.push(oc.id, os.id);

    // Solo los productos pueden recibirse; el vencimiento corre desde la última recepción (15 días).
    const lineaOc = (await api().get(`/administracion/documentos-origen/${oc.id}`).expect(200)).body.lineas[0];
    expect(lineaOc.tipo_producto).toBe('PRODUCTO');
    await api().post('/almacen/recepciones').send({ id_orden_compra: oc.id, id_almacen: 1, fecha: '2026-10-12', lineas: [{ id_orden_compra_detalle: lineaOc.id, cantidad: '10' }] }).expect(201);
    const ocRecibida = (await api().get(`/administracion/documentos-origen/${oc.id}`).expect(200)).body;
    expect(ocRecibida.vencimiento).toBe('2026-10-27');
    expect(ocRecibida.pendiente_recepcion).toBe(false);
    expect(ocRecibida.retencion_motivo).toMatch(/3 %/);

    // ---------------------------------------------------------------- programación (viernes)
    const item = (idDoc: number, fecha: string, monto: string, extra: Record<string, unknown> = {}) => ({
      id_documento_origen: idDoc,
      fecha_programada: fecha,
      monto,
      medio_pago: 'TRANSFERENCIA',
      id_cuenta: cuentaPen,
      ...extra,
    });
    const programar = (items: unknown[]) => api().post('/tesoreria/programacion').send({ id_programado_por: trabajadores[0], items });

    expect((await programar([item(oc.id, MIERCOLES, '100')])).status).toBe(400); // no es viernes
    expect((await programar([item(oc.id, MIERCOLES, '100', { urgente: true })])).status).toBe(400); // urgente sin motivo
    expect((await programar([item(oc.id, VIERNES, '1144.61')])).status).toBe(400); // supera el neto
    expect((await programar([item(oc.id, VIERNES, '100', { concepto: 'DETRACCION' })])).status).toBe(400); // la OC no tiene detracción
    expect((await programar([item(oc.id, VIERNES, '600'), item(oc.id, VIERNES, '600')])).status).toBe(400); // el lote entero supera el saldo
    expect((await api().get('/tesoreria/programacion').query({ desde: '2026-01-01', hasta: '2026-12-31' }).expect(200)).body.items.filter((i: { id_documento_origen: number }) => i.id_documento_origen === oc.id)).toHaveLength(0); // todo o nada

    const cuotas = (await programar([item(oc.id, VIERNES, '600'), item(oc.id, VIERNES, '544.60')]).expect(201)).body;
    expect(cuotas).toHaveLength(2);
    const urgente = (await programar([item(os.id, MIERCOLES, '100', { urgente: true, observaciones: 'Proveedor exige adelanto' })]).expect(201)).body[0];
    expect(urgente.urgente).toBe(true);
    await api().post(`/tesoreria/programacion/${urgente.id}/cancelar`).expect(200);
    await api().post(`/tesoreria/programacion/${urgente.id}/cancelar`).expect(409);
    await programar([item(os.id, VIERNES, '1062'), item(os.id, VIERNES_2, '118', { concepto: 'DETRACCION', medio_pago: 'DEPOSITO' })]).expect(201);

    const reprogramada = await api().patch(`/tesoreria/programacion/${cuotas[1].id}`).send({ fecha_programada: MIERCOLES }).expect(400);
    expect(String(reprogramada.body.message)).toContain('viernes');
    expect((await documentoPorId(oc.id)).estado_pago).toBe('PROGRAMADO');

    const agenda = (await api().get('/tesoreria/programacion').query({ desde: VIERNES, hasta: VIERNES_2 }).expect(200)).body;
    expect(agenda.totales_por_fecha.length).toBeGreaterThanOrEqual(2);
    const pendientes = (await api().get('/tesoreria/programacion/pendientes').expect(200)).body;
    expect(pendientes.data.some((d: { id: number }) => d.id === oc.id)).toBe(false); // ya está todo programado

    // ---------------------------------------------------------------- pagos
    const pagar = (idProg: number, extra: Record<string, unknown> = {}) =>
      api().post('/tesoreria/pagos').send({ id_pago_programado: idProg, fecha_pago: VIERNES, id_cuenta: cuentaPen, id_ejecutado_por: trabajadores[0], ...extra });

    expect((await pagar(cuotas[0].id)).status).toBe(400); // transferencia sin n.º de operación
    const p1 = (await pagar(cuotas[0].id, { numero_operacion: 'OP-0001' }).expect(201)).body;
    expect(p1.numero).toMatch(/^CP-\d{6}$/);
    expect(num(p1.monto)).toBe(600);
    expect(p1.proveedor).toBe('ZZ-ADM PROVEEDOR A');
    expect((await pagar(cuotas[0].id, { numero_operacion: 'OP-0001' })).status).toBe(409); // ya ejecutada
    expect((await documentoPorId(oc.id)).estado_pago).toBe('PARCIAL');

    // Pago parcial de la 2.ª cuota: el resto queda programado.
    const p2 = (await pagar(cuotas[1].id, { numero_operacion: 'OP-0002', monto: '500' }).expect(201)).body;
    expect(num(p2.monto)).toBe(500);
    const restante = (await api().get('/tesoreria/programacion').query({ desde: VIERNES, hasta: VIERNES }).expect(200)).body.items.find(
      (i: { id_documento_origen: number }) => i.id_documento_origen === oc.id,
    );
    expect(num(restante.monto)).toBeCloseTo(44.6, 2);

    // Anular un pago devuelve el saldo y reabre la programación.
    const anulado = (await api().post(`/tesoreria/pagos/${p1.id}/anular`).send({ motivo: 'Error de cuenta' }).expect(200)).body;
    expect(anulado.estado).toBe('ANULADO');
    await api().post(`/tesoreria/pagos/${p1.id}/anular`).send({}).expect(409);
    expect(num((await documentoPorId(oc.id)).pagado_proveedor)).toBe(500);
    await pagar(cuotas[0].id, { numero_operacion: 'OP-0003' }).expect(201);
    await pagar(restante.id, { numero_operacion: 'OP-0004' }).expect(201);
    const ocPagada = await documentoPorId(oc.id);
    expect(ocPagada.estado_pago).toBe('PAGADO');
    expect(num(ocPagada.saldo_por_pagar_proveedor)).toBe(0);
    expect(ocPagada.fecha_ultimo_pago).toBe(VIERNES);

    // Un documento con pagos no se anula, ni se elimina, ni cambia de montos.
    await api().post(`/administracion/documentos-origen/${oc.id}/anular`).send({}).expect(409);
    await api().delete(`/documentos/origen/${oc.id}`).expect(409);
    await api().patch(`/administracion/documentos-origen/${oc.id}/deducciones`).send({ renta_4ta: 10 }).expect(409);
    await api().patch(`/administracion/documentos-origen/${oc.id}/deducciones`).send({ dias_credito: 30 }).expect(200); // el crédito sí
    await api().post(`/requerimientos/${fur.id}/anular`).send({}).expect(409);

    // Pago en moneda distinta: sin tipo de cambio falla, con el del día se convierte.
    const progOs = (await api().get('/tesoreria/programacion').query({ desde: VIERNES, hasta: VIERNES_2 }).expect(200)).body.items.filter((i: { id_documento_origen: number }) => i.id_documento_origen === os.id);
    const progOsProveedor = progOs.find((i: { concepto: string }) => i.concepto === 'PROVEEDOR');
    const progOsDetraccion = progOs.find((i: { concepto: string }) => i.concepto === 'DETRACCION');
    const sinTc = await pagar(progOsProveedor.id, { id_cuenta: cuentaUsd, numero_operacion: 'OP-USD' });
    expect(sinTc.status).toBe(400);
    expect(String(sinTc.body.message)).toContain('tipo de cambio');
    await api().post('/tesoreria/tipo-cambio').send({ fecha: VIERNES, moneda_id: 'USD', compra: '3.70', venta: '3.80' }).expect(201);
    await api().post('/tesoreria/tipo-cambio').send({ fecha: VIERNES, moneda_id: 'USD', compra: '3.90', venta: '3.80' }).expect(400);
    const pUsd = (await pagar(progOsProveedor.id, { id_cuenta: cuentaUsd, numero_operacion: 'OP-USD' }).expect(201)).body;
    expect(pUsd.moneda_cuenta).toBe('USD');
    expect(num(pUsd.tipo_cambio)).toBeCloseTo(3.8, 4);
    expect(num(pUsd.monto_cuenta)).toBeCloseTo(1062 / 3.8, 2);

    // La detracción se paga aparte, en soles.
    expect((await documentoPorId(os.id)).estado_pago).toBe('PARCIAL');
    await pagar(progOsDetraccion.id, { fecha_pago: VIERNES_2, medio_pago: 'DEPOSITO', numero_operacion: 'CONST-123' }).expect(201);
    expect((await documentoPorId(os.id)).estado_pago).toBe('PAGADO');

    // Reportes.
    const retenciones = (await api().get('/tesoreria/consulta/retenciones').query({ periodo: '2026-10' }).expect(200)).body;
    expect(retenciones.retenciones.some((r: { id: number }) => r.id === oc.id)).toBe(true);
    expect(retenciones.detracciones.some((d: { constancia: string }) => d.constancia === 'CONST-123')).toBe(true);
    const resumen = (await api().get('/tesoreria/consulta/resumen').query({ id_centro_costo: centroCostoId }).expect(200)).body;
    expect(num(resumen.kpis.comprometido)).toBeGreaterThan(0);
    expect(num(resumen.kpis.pagado)).toBeGreaterThan(0);
    expect(resumen.pagado_por_proveedor.some((p: { nombre: string }) => p.nombre === 'ZZ-ADM PROVEEDOR A')).toBe(true);

    // Expediente completo.
    const exp = (await api().get(`/administracion/documentos-origen/${oc.id}/expediente`).expect(200)).body;
    expect(exp.requerimiento.numero).toBe(fur.numero);
    expect(exp.cuadro_comparativo.proveedores).toHaveLength(2);
    expect(exp.recepciones).toHaveLength(1);
    expect(exp.documento.pagos.filter((p: { estado: string }) => p.estado === 'REGISTRADO')).toHaveLength(3);
  });

  async function documentoPorId(id: number) {
    return (await api().get(`/administracion/documentos-origen/${id}`).expect(200)).body as Record<string, any>;
  }

  it('planilla por trabajador, caja chica y pago directo fuera de viernes', async () => {
    // Una planilla sin importe es inválida; con importe genera un documento por trabajador.
    const sinImporte = await crearFur([{ id_producto: conceptoPlanilla, cantidad: '1', id_beneficiario: trabajadores[0] }], {
      tipo: 'PLANILLA_PERSONAL',
    });
    expect(sinImporte.status).toBe(400);
    const sinBeneficiario = await crearFur([{ id_producto: conceptoPlanilla, cantidad: '1', precio_referencial: '100' }], { tipo: 'PLANILLA_PERSONAL' });
    expect(sinBeneficiario.status).toBe(400);

    const planilla = (
      await crearFur(
        [
          { id_producto: conceptoPlanilla, cantidad: '1', precio_referencial: '1500', id_beneficiario: trabajadores[0] },
          { id_producto: conceptoPlanilla, cantidad: '1', precio_referencial: '1800', id_beneficiario: trabajadores[1] },
        ],
        { tipo: 'PLANILLA_PERSONAL' },
      ).then((r) => {
        expect(r.status).toBe(201);
        return r;
      })
    ).body;
    // Sin cotizaciones: no se cotiza y se aprueba directo desde ENVIADO.
    await api().post(`/requerimientos/${planilla.id}/cerrar-cotizacion`).send({}).expect(409);
    await api().post(`/requerimientos/${planilla.id}/enviar`).send({}).expect(200);
    await api().post(`/requerimientos/${planilla.id}/cotizaciones`).send({}).expect(400);
    const aprobada = await api().post(`/requerimientos/${planilla.id}/aprobar`).send({ id_aprobador: trabajadores[0] }).expect(200);
    expect(aprobada.body.estado).toBe('APROBADO');
    const docs = await documentosDe(planilla.id);
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => d.clase_documento === 'PLANILLA_PERSONAL')).toBe(true);
    expect(docs.map((d) => num(d.total)).sort()).toEqual([1500, 1800]);
    expect(docs.every((d) => d.retencion_monto === null && d.detraccion_monto === null)).toBe(true); // las planillas no se retienen
    expect(docs.map((d) => d.numero_documento)[0]).toMatch(/^PP-\d{6}$/);

    // Caja chica: un solo monto total.
    const caja = (
      await crearFur([{ id_producto: conceptoCaja, cantidad: '1', precio_referencial: '200' }], {
        tipo: 'CAJA_CHICA',
        id_beneficiario: trabajadores[0],
      })
    ).body;
    await api().post(`/requerimientos/${caja.id}/enviar`).send({}).expect(200);
    await api().post(`/requerimientos/${caja.id}/aprobar`).send({ id_aprobador: trabajadores[0] }).expect(200);
    const [cajaDoc] = await documentosDe(caja.id);
    expect(cajaDoc.clase_documento).toBe('CAJA_CHICA');
    expect(cajaDoc.numero_documento).toMatch(/^CCH-\d{6}$/);
    expect(num(cajaDoc.total)).toBe(200);

    // Pago directo un miércoles: se crea como urgente y queda pagado en efectivo.
    const cuentaCaja = (await api().post('/tesoreria/cuentas').send({ codigo: 'ZZ-ADM-CAJA', nombre: 'Caja de prueba', tipo: 'CAJA', moneda_id: 'PEN' }).expect(201)).body.id;
    const pago = (
      await api()
        .post('/tesoreria/pagos/directo')
        .send({ id_documento_origen: cajaDoc.id, fecha_pago: MIERCOLES, monto: '200', medio_pago: 'EFECTIVO', id_cuenta: cuentaCaja, id_ejecutado_por: trabajadores[0] })
        .expect(201)
    ).body;
    expect(pago.numero).toMatch(/^CP-\d{6}$/);
    expect((await documentoPorId(cajaDoc.id)).estado_pago).toBe('PAGADO');
    await api().post('/tesoreria/pagos/directo').send({ id_documento_origen: cajaDoc.id, fecha_pago: MIERCOLES, monto: '1', medio_pago: 'EFECTIVO', id_cuenta: cuentaCaja }).expect(400); // sin saldo
  });

  it('registro directo: detracción, retención automática y manual, y proveedor exceptuado', async () => {
    const base = {
      clase_documento: 'PAGO_SERVICIO',
      id_anexo: provA,
      concepto: 'Recibo de luz octubre',
      monto: '1000',
      fecha_emision: '2026-10-12',
      forma_pago: 'Credito 7 dias',
      dias_credito: 7,
    };
    const luz = (await api().post('/administracion/documentos-origen/directo').send(base).expect(201)).body;
    documentoIds.push(luz.id);
    expect(luz.numero_documento).toMatch(/^PS-\d{6}$/);
    expect(num(luz.total)).toBe(1180);
    expect(num(luz.detraccion_monto)).toBe(118); // propone 10 % en servicios
    expect(luz.retencion_monto).toBeNull();
    expect(luz.vencimiento).toBe('2026-10-19'); // emisión + 7 días (no es OC)

    // Quitar la detracción hace que aplique la retención automática; luego se corrige a mano y se vuelve al cálculo.
    let r = (await api().patch(`/administracion/documentos-origen/${luz.id}/deducciones`).send({ detraccion_porcentaje: 0 }).expect(200)).body;
    expect(r.detraccion_monto).toBeNull();
    expect(num(r.retencion_monto)).toBeCloseTo(35.4, 2);
    r = (await api().patch(`/administracion/documentos-origen/${luz.id}/deducciones`).send({ retencion_monto: 50 }).expect(200)).body;
    expect(num(r.retencion_monto)).toBe(50);
    expect(r.retencion_manual).toBe(true);
    r = (await api().patch(`/administracion/documentos-origen/${luz.id}/deducciones`).send({ retencion_monto: null }).expect(200)).body;
    expect(num(r.retencion_monto)).toBeCloseTo(35.4, 2);
    expect(r.retencion_manual).toBe(false);
    // Con renta de 4.ª y vencimiento manual, el neto y la fecha lo reflejan.
    r = (await api().patch(`/administracion/documentos-origen/${luz.id}/deducciones`).send({ renta_4ta: 100, fecha_vencimiento: '2026-11-30' }).expect(200)).body;
    expect(num(r.neto_proveedor)).toBeCloseTo(1180 - 100 - 35.4, 2);
    expect(r.vencimiento).toBe('2026-11-30');

    // Proveedor exceptuado: sin retención.
    await db.query('update anexos set exceptuado_retencion = true where id = $1', [provB]);
    const exceptuado = (await api().post('/administracion/documentos-origen/directo').send({ ...base, id_anexo: provB, clase_documento: 'OTRO', detraccion_porcentaje: 0 }).expect(201)).body;
    documentoIds.push(exceptuado.id);
    expect(exceptuado.retencion_monto).toBeNull();
    expect(exceptuado.retencion_motivo).toMatch(/exceptuado/);

    // Un gasto financiero no cobra IGV ni retiene.
    const gf = (await api().post('/administracion/documentos-origen/directo').send({ ...base, clase_documento: 'GASTO_FINANCIERO', afecto_igv: false, concepto: 'Comisión bancaria' }).expect(201)).body;
    documentoIds.push(gf.id);
    expect(num(gf.total)).toBe(1000);
    expect(gf.retencion_monto).toBeNull();
    expect(gf.detraccion_monto).toBeNull();

    // En dólares exige tipo de cambio registrado a la fecha o antes.
    const usd = await api().post('/administracion/documentos-origen/directo').send({ ...base, fecha_emision: '2026-01-01', moneda_id: 'USD', moneda_simbolo: '$' });
    expect(usd.status).toBe(400);
    expect(String(usd.body.message)).toContain('tipo de cambio');

    // Validaciones.
    await api().post('/administracion/documentos-origen/directo').send({ ...base, clase_documento: 'ORDEN_COMPRA' }).expect(400);
    await api().post('/administracion/documentos-origen/directo').send({ ...base, id_anexo: 987654321 }).expect(400);

    // Anular un documento sin dependientes lo saca de las consultas por pagar.
    const anulado = (await api().post(`/administracion/documentos-origen/${gf.id}/anular`).send({ motivo: 'Duplicado' }).expect(200)).body;
    expect(anulado.estado).toBe('ANULADO');
    expect(anulado.estado_pago).toBe('ANULADO');
    await api().post(`/administracion/documentos-origen/${gf.id}/anular`).send({}).expect(409);
    const lista = (await api().get('/administracion/documentos-origen').query({ estado_pago: 'SIN_PROGRAMAR', clase_documento: 'PAGO_SERVICIO', monto_min: 1000 }).expect(200)).body;
    expect(lista.data.some((d: { id: number }) => d.id === luz.id)).toBe(true);
    expect(lista.data.some((d: { id: number }) => d.id === gf.id)).toBe(false);
  });

  it('las 237 OC históricas se listan clasificadas y con su estado de pago', async () => {
    const lista = (await api().get('/administracion/documentos-origen').query({ pageSize: 5, clase_documento: 'ORDEN_SERVICIO' }).expect(200)).body;
    expect(lista.total).toBeGreaterThan(0);
    expect(lista.data[0].clase_documento).toBe('ORDEN_SERVICIO');
    expect(['SIN_PROGRAMAR', 'PROGRAMADO', 'PARCIAL', 'PAGADO', 'ANULADO']).toContain(lista.data[0].estado_pago);
    const historicas = (await api().get('/administracion/documentos-origen').query({ pageSize: 100, fecha_hasta: '2026-06-30' }).expect(200)).body;
    expect(historicas.data.every((d: { clase_documento: string }) => ['ORDEN_COMPRA', 'ORDEN_SERVICIO'].includes(d.clase_documento))).toBe(true);
  });
});
