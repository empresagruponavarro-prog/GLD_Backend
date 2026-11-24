import { Injectable } from '@nestjs/common';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AlmacenSql, I, IN, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { redondear2 } from '../shared/cuota.js';
import { m2 } from '../shared/serializar.js';

export const AGRUPACIONES = ['cliente', 'obra', 'contratista'] as const;
export type Agrupacion = (typeof AGRUPACIONES)[number];

export class ConsultaQueryDto {
  @ApiPropertyOptional({ enum: AGRUPACIONES, default: 'cliente' }) @IsOptional() @IsIn(AGRUPACIONES)
  agrupar?: Agrupacion;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_centro_costo?: number;
}

interface Acumulado {
  clave: string;
  nombre: string;
  contratos: number;
  contratado: number;
  adelanto: number;
  valorizado: number;
  amortizado: number;
  descuentos: number;
  garantia_retenida: number;
  liberado: number;
  pagado: number;
}

const vacio = (clave: string, nombre: string): Acumulado => ({ clave, nombre, contratos: 0, contratado: 0, adelanto: 0, valorizado: 0, amortizado: 0, descuentos: 0, garantia_retenida: 0, liberado: 0, pagado: 0 });

/**
 * Consulta de ejecución de pagos de las valorizaciones (plan 12, R-17): por cliente, obra o contratista, lo contratado, el adelanto, lo valorizado,
 * lo amortizado, lo descontado, la garantía retenida, lo liberado (aprobado) y lo pagado. Todo en la moneda de cada orden (sin convertir): los
 * contratos en dólares se suman aparte en `otras_monedas`.
 */
@Injectable()
export class ConsultaValorizacionesHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async consultar(query: ConsultaQueryDto) {
    const agrupar = query.agrupar ?? 'cliente';
    const cc = query.id_centro_costo ?? 0;
    const q = sqlTag(this.sql);
    const filas = await q.rows<Record<string, string | number | null>>(
      {
        id_cc: IN, obra: TN, id_cliente: IN, cliente: TN, id_prov: IN, proveedor: TN, moneda: TN, total: T, adelanto: T, valorizado: T, amortizado: T, descuentos: T,
        garantia: T, liberado: T, pagado: T, n: I,
      },
    )`
      SELECT o.id_centro_costo AS id_cc, cc.centro_costo::text AS obra, cc.id_anexo AS id_cliente, COALESCE(cl."NombreComercial", cl."Anexo")::text AS cliente,
             o.id_anexo AS id_prov, COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, o.moneda_simbolo::text AS moneda, COALESCE(o.total, 0)::text AS total,
             COALESCE(SUM(v.neto) FILTER (WHERE v.estado::text = 'APROBADA' AND v.tipo::text = 'ADELANTO'), 0)::text AS adelanto,
             COALESCE(SUM(v.valorizado) FILTER (WHERE v.estado::text = 'APROBADA'), 0)::text AS valorizado,
             COALESCE(SUM(v.amortizacion) FILTER (WHERE v.estado::text = 'APROBADA'), 0)::text AS amortizado,
             COALESCE(SUM(v.descuentos) FILTER (WHERE v.estado::text = 'APROBADA'), 0)::text AS descuentos,
             COALESCE(SUM(v.garantia) FILTER (WHERE v.estado::text = 'APROBADA'), 0)::text AS garantia,
             COALESCE(SUM(v.neto) FILTER (WHERE v.estado::text = 'APROBADA'), 0)::text AS liberado,
             COALESCE((SELECT SUM(p.monto) FROM pago p WHERE p.id_documento_origen = o.id AND p.estado::text = 'REGISTRADO' AND p.concepto::text = 'PROVEEDOR'), 0)::text AS pagado,
             1 AS n
        FROM contrato_valorizacion c
        JOIN "documentosOrigen" o ON o.id = c.id_documento_origen
        LEFT JOIN "CentroCostos" cc ON cc.id = o.id_centro_costo
        LEFT JOIN anexos cl ON cl.id = cc.id_anexo
        LEFT JOIN anexos a ON a.id = o.id_anexo
        LEFT JOIN valorizacion v ON v.id_contrato = c.id
       WHERE c.estado::text <> 'ANULADO' AND (${cc}::int = 0 OR o.id_centro_costo = ${cc}::int)
       GROUP BY c.id, o.id, cc.id, cl.id, a.id`;

    const grupos = new Map<string, Acumulado>();
    const otras = vacio('otras', 'Otras monedas');
    for (const f of filas) {
      const esSoles = (f['moneda'] ?? 'S/') === 'S/' || (f['moneda'] ?? '').toString().startsWith('S/');
      const [clave, nombre] =
        agrupar === 'cliente'
          ? [String(f['id_cliente'] ?? 0), (f['cliente'] as string | null) ?? 'Sin cliente']
          : agrupar === 'obra'
            ? [String(f['id_cc'] ?? 0), (f['obra'] as string | null) ?? 'Sin obra']
            : [String(f['id_prov'] ?? 0), (f['proveedor'] as string | null) ?? 'Sin contratista'];
      const a = esSoles ? (grupos.get(clave) ?? vacio(clave, nombre)) : otras;
      a.contratos += 1;
      a.contratado += Number(f['total']);
      a.adelanto += Number(f['adelanto']);
      a.valorizado += Number(f['valorizado']);
      a.amortizado += Number(f['amortizado']);
      a.descuentos += Number(f['descuentos']);
      a.garantia_retenida += Number(f['garantia']);
      a.liberado += Number(f['liberado']);
      a.pagado += Number(f['pagado']);
      if (esSoles) grupos.set(clave, a);
    }
    const salida = (a: Acumulado) => ({
      clave: a.clave,
      nombre: a.nombre,
      contratos: a.contratos,
      contratado: m2(a.contratado),
      adelanto: m2(a.adelanto),
      valorizado: m2(a.valorizado),
      amortizado: m2(a.amortizado),
      descuentos: m2(a.descuentos),
      garantia_retenida: m2(a.garantia_retenida),
      liberado: m2(a.liberado),
      pagado: m2(a.pagado),
      por_pagar: m2(Math.max(redondear2(a.liberado - a.pagado), 0)),
      pendiente_valorizar: m2(Math.max(redondear2(a.contratado - a.valorizado), 0)),
      avance_pct: a.contratado > 0 ? Math.round((a.valorizado / a.contratado) * 1000) / 10 : 0,
    });
    const lista = [...grupos.values()].sort((x, y) => y.contratado - x.contratado);
    const total = lista.reduce((t, a) => {
      for (const k of ['contratos', 'contratado', 'adelanto', 'valorizado', 'amortizado', 'descuentos', 'garantia_retenida', 'liberado', 'pagado'] as const) t[k] += a[k];
      return t;
    }, vacio('total', 'Total'));
    return {
      agrupar,
      moneda: 'S/',
      filas: lista.map(salida),
      totales: salida(total),
      otras_monedas: otras.contratos > 0 ? salida(otras) : null,
    };
  }
}
