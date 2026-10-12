import { Injectable } from '@nestjs/common';
import { AlmacenSql, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { ConversorSoles } from '../shared/conversor-soles.js';
import { consultarDocumentos } from '../shared/documentos-consulta.js';
import { esSoles, redondear, sumarDias } from '../shared/tributos.js';
import { ConsultaResumenQueryDto } from '../tesoreria.dto.js';

const EPS = 0.005;
const f2 = (n: number) => redondear(n).toFixed(2);

interface Acumulado {
  nombre: string;
  monto: number;
  cantidad: number;
}

function sumar(mapa: Map<string, Acumulado>, nombre: string, monto: number): void {
  const a = mapa.get(nombre) ?? { nombre, monto: 0, cantidad: 0 };
  a.monto += monto;
  a.cantidad += 1;
  mapa.set(nombre, a);
}

function ordenado(mapa: Map<string, Acumulado>, tope = 15) {
  return [...mapa.values()]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, tope)
    .map((a) => ({ nombre: a.nombre, monto_soles: f2(a.monto), cantidad: a.cantidad }));
}

@Injectable()
export class ConsultaHandler {
  constructor(private readonly sql: AlmacenSql) {}

  /** Datos del tablero gerencial, todo expresado en soles (plan 06 §6.3). */
  async resumen(query: ConsultaResumenQueryDto) {
    const hoy = new Date().toISOString().slice(0, 10);
    const conv = new ConversorSoles(this.sql);
    const docs = await consultarDocumentos(
      this.sql,
      {
        estado: 'REGISTRADO',
        fecha_desde: query.desde,
        fecha_hasta: query.hasta,
        id_centro_costo: query.id_centro_costo,
        id_centro_costos_principal: query.id_centro_costos_principal,
        id_area: query.id_area,
        clase_documento: query.clase_documento,
      },
      100000,
      0,
    );

    let comprometido = 0;
    let pagado = 0;
    let programado = 0;
    let saldo = 0;
    const porMes = new Map<string, { comprometido: number; pagado: number }>();
    const deudaCc = new Map<string, Acumulado>();
    const deudaCcp = new Map<string, Acumulado>();
    const deudaArea = new Map<string, Acumulado>();
    const venc = { vencido: { monto: 0, cantidad: 0 }, semana: { monto: 0, cantidad: 0 }, mes: { monto: 0, cantidad: 0 }, despues: { monto: 0, cantidad: 0 }, sin_fecha: { monto: 0, cantidad: 0 } };
    const proximos: Array<{ id: number; numero_documento: string | null; proveedor: string | null; vencimiento: string | null; saldo_soles: number }> = [];

    for (const d of docs) {
      const fecha = d.fecha_emision ?? hoy;
      const totalS = await conv.aSoles(Number(d.total), d.moneda_id, d.moneda_simbolo, fecha);
      const saldoS =
        (await conv.aSoles(Number(d.saldo_por_pagar_proveedor), d.moneda_id, d.moneda_simbolo, fecha)) + Number(d.saldo_por_pagar_detraccion);
      const pagS = (await conv.aSoles(Number(d.pagado_proveedor), d.moneda_id, d.moneda_simbolo, fecha)) + Number(d.pagado_detraccion);
      const progS = (await conv.aSoles(Number(d.programado_proveedor), d.moneda_id, d.moneda_simbolo, fecha)) + Number(d.programado_detraccion);
      comprometido += totalS;
      pagado += pagS;
      programado += progS;
      saldo += saldoS;
      const mes = fecha.slice(0, 7);
      const m = porMes.get(mes) ?? { comprometido: 0, pagado: 0 };
      m.comprometido += totalS;
      porMes.set(mes, m);

      if (saldoS > EPS) {
        sumar(deudaCc, d.centro_costo ?? 'Sin centro de costos', saldoS);
        sumar(deudaCcp, d.centro_costo_principal ?? 'Sin grupo', saldoS);
        sumar(deudaArea, d.area_nombre ?? 'Sin área', saldoS);
        const clave = d.vencimiento === null ? 'sin_fecha' : d.vencimiento < hoy ? 'vencido' : d.vencimiento <= sumarDias(hoy, 7) ? 'semana' : d.vencimiento <= sumarDias(hoy, 30) ? 'mes' : 'despues';
        venc[clave].monto += saldoS;
        venc[clave].cantidad += 1;
        proximos.push({ id: d.id, numero_documento: d.numero_documento, proveedor: d.proveedor, vencimiento: d.vencimiento, saldo_soles: saldoS });
      }
    }

    // Pagos efectivos del periodo: por mes de pago y por proveedor.
    const q = sqlTag(this.sql);
    const desde = query.desde ?? '1900-01-01';
    const hasta = query.hasta ?? '9999-12-31';
    const cc = query.id_centro_costo ?? 0;
    const ccp = query.id_centro_costos_principal ?? 0;
    const area = query.id_area ?? 0;
    const clase = query.clase_documento ?? '';
    const pagos = await q.rows<{ fecha: string; monto: string; concepto: string; moneda_id: string | null; simbolo: string | null; proveedor: string | null }>(
      { fecha: T, monto: T, concepto: T, moneda_id: TN, simbolo: TN, proveedor: TN },
    )`
      SELECT p.fecha_pago::text AS fecha, p.monto::text AS monto, p.concepto::text AS concepto, o.moneda_id::text AS moneda_id,
             o.moneda_simbolo::text AS simbolo, COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor
        FROM pago p JOIN "documentosOrigen" o ON o.id = p.id_documento_origen
        LEFT JOIN anexos a ON a.id = o.id_anexo LEFT JOIN "CentroCostos" c ON c.id = o.id_centro_costo
       WHERE p.estado = 'REGISTRADO' AND p.fecha_pago >= ${desde}::date AND p.fecha_pago <= ${hasta}::date
         AND (${cc}::int = 0 OR o.id_centro_costo = ${cc}::int) AND (${ccp}::int = 0 OR c.id_centro_costos_principal = ${ccp}::int)
         AND (${area}::int = 0 OR o.id_area = ${area}::int) AND (${clase}::text = '' OR o.clase_documento = ${clase}::text)`;
    const porProveedor = new Map<string, Acumulado>();
    const pagosPorMes = new Map<string, number>();
    for (const p of pagos) {
      const s = p.concepto === 'DETRACCION' ? Number(p.monto) : await conv.aSoles(Number(p.monto), p.moneda_id, p.simbolo, p.fecha);
      sumar(porProveedor, p.proveedor ?? 'Sin proveedor', s);
      pagosPorMes.set(p.fecha.slice(0, 7), (pagosPorMes.get(p.fecha.slice(0, 7)) ?? 0) + s);
    }
    for (const [mes, monto] of pagosPorMes) {
      const m = porMes.get(mes) ?? { comprometido: 0, pagado: 0 };
      m.pagado += monto;
      porMes.set(mes, m);
    }

    // Programado pendiente por cuenta.
    const prog = await q.rows<{ cuenta: string | null; monto: string; concepto: string; moneda_id: string | null; simbolo: string | null; fecha: string }>(
      { cuenta: TN, monto: T, concepto: T, moneda_id: TN, simbolo: TN, fecha: T },
    )`
      SELECT c.nombre::text AS cuenta, g.monto::text AS monto, g.concepto::text AS concepto, o.moneda_id::text AS moneda_id,
             o.moneda_simbolo::text AS simbolo, g.fecha_programada::text AS fecha
        FROM pago_programado g JOIN "documentosOrigen" o ON o.id = g.id_documento_origen
        LEFT JOIN cuenta_tesoreria c ON c.id = g.id_cuenta LEFT JOIN "CentroCostos" cc2 ON cc2.id = o.id_centro_costo
       WHERE g.estado = 'PROGRAMADO' AND (${cc}::int = 0 OR o.id_centro_costo = ${cc}::int)
         AND (${ccp}::int = 0 OR cc2.id_centro_costos_principal = ${ccp}::int) AND (${area}::int = 0 OR o.id_area = ${area}::int)
         AND (${clase}::text = '' OR o.clase_documento = ${clase}::text)`;
    const porCuenta = new Map<string, Acumulado>();
    for (const g of prog) {
      const s = g.concepto === 'DETRACCION' ? Number(g.monto) : await conv.aSoles(Number(g.monto), g.moneda_id, g.simbolo, g.fecha);
      sumar(porCuenta, g.cuenta ?? 'Sin cuenta asignada', s);
    }

    const bucket = (b: { monto: number; cantidad: number }) => ({ monto_soles: f2(b.monto), cantidad: b.cantidad });
    return {
      moneda: 'PEN',
      sin_tipo_cambio: conv.sinTipoCambio,
      kpis: { comprometido: f2(comprometido), programado: f2(programado), pagado: f2(pagado), saldo_por_pagar: f2(saldo), documentos: docs.length },
      por_mes: [...porMes]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, v]) => ({ mes, comprometido_soles: f2(v.comprometido), pagado_soles: f2(v.pagado) })),
      deuda_por_centro_costo: ordenado(deudaCc),
      deuda_por_grupo_centro_costo: ordenado(deudaCcp),
      deuda_por_area: ordenado(deudaArea),
      vencimientos: {
        vencidos: bucket(venc.vencido),
        esta_semana: bucket(venc.semana),
        este_mes: bucket(venc.mes),
        mas_adelante: bucket(venc.despues),
        sin_fecha: bucket(venc.sin_fecha),
        proximos: proximos
          .filter((p) => p.vencimiento !== null)
          .sort((a, b) => (a.vencimiento ?? '').localeCompare(b.vencimiento ?? ''))
          .slice(0, 15)
          .map((p) => ({ ...p, saldo_soles: f2(p.saldo_soles) })),
      },
      pagado_por_proveedor: ordenado(porProveedor, 10),
      programado_por_cuenta: ordenado(porCuenta),
    };
  }

  /** Retenciones del IGV (por documento, en el mes de su primer pago) y detracciones pagadas en el mes. */
  async retenciones(periodo: string) {
    const q = sqlTag(this.sql);
    const desde = `${periodo}-01`;
    const retenciones = await q.rows<Record<string, unknown>>({
      id: { codecId: 'pg/int4@1', nullable: false },
      numero_documento: TN,
      proveedor: TN,
      ruc: TN,
      fecha_pago: T,
      moneda_id: TN,
      moneda_simbolo: TN,
      total: T,
      retencion_monto: T,
    })`
      SELECT o.id, o.numero_documento::text AS numero_documento, COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor,
             a."NumeroDocIde"::text AS ruc, pp.primer_pago::text AS fecha_pago, o.moneda_id::text AS moneda_id,
             o.moneda_simbolo::text AS moneda_simbolo, COALESCE(o.total, 0)::text AS total, o.retencion_monto::text AS retencion_monto
        FROM "documentosOrigen" o
        JOIN (SELECT id_documento_origen, min(fecha_pago) AS primer_pago FROM pago
               WHERE estado = 'REGISTRADO' AND concepto = 'PROVEEDOR' GROUP BY id_documento_origen) pp ON pp.id_documento_origen = o.id
        LEFT JOIN anexos a ON a.id = o.id_anexo
       WHERE o.estado = 'REGISTRADO' AND COALESCE(o.retencion_monto, 0) > 0
         AND pp.primer_pago >= ${desde}::date AND pp.primer_pago < (${desde}::date + interval '1 month')
       ORDER BY pp.primer_pago, o.id`;
    const detracciones = await q.rows<Record<string, unknown>>({
      id: { codecId: 'pg/int4@1', nullable: false },
      numero_pago: T,
      numero_documento: TN,
      proveedor: TN,
      ruc: TN,
      fecha_pago: T,
      monto: T,
      constancia: TN,
    })`
      SELECT p.id, p.numero::text AS numero_pago, o.numero_documento::text AS numero_documento,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, a."NumeroDocIde"::text AS ruc,
             p.fecha_pago::text AS fecha_pago, p.monto::text AS monto, p.numero_operacion::text AS constancia
        FROM pago p JOIN "documentosOrigen" o ON o.id = p.id_documento_origen LEFT JOIN anexos a ON a.id = o.id_anexo
       WHERE p.estado = 'REGISTRADO' AND p.concepto = 'DETRACCION'
         AND p.fecha_pago >= ${desde}::date AND p.fecha_pago < (${desde}::date + interval '1 month')
       ORDER BY p.fecha_pago, p.id`;
    const totalRet = retenciones.reduce((a, r) => a + Number(r['retencion_monto']), 0);
    const totalDet = detracciones.reduce((a, d) => a + Number(d['monto']), 0);
    return {
      periodo,
      retenciones: retenciones.map((r) => ({ ...r, en_soles: esSoles(r['moneda_id'] as string | null, r['moneda_simbolo'] as string | null) })),
      detracciones,
      totales: { retenciones: f2(totalRet), detracciones_soles: f2(totalDet) },
      nota: 'La retencion se informa en la moneda del documento y en el mes del primer pago al proveedor.',
    };
  }
}
