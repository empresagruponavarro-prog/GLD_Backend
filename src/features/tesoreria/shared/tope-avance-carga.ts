import { AlmacenSql, I, IN, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { avanceDeLinea, avancesPorSubfase, subfasesDeLineas } from '../../operaciones-obra/shared/avances-subfase.js';
import type { OrmObra } from '../../operaciones-obra/shared/control-avance/orm.js';
import { disponibleAvance, montoSugerido, topeAvance, type LineaTope } from './tope-avance.js';
import { redondear } from './tributos.js';

/** Lo que hace falta de un documento para saber si lleva tope y cuánto. */
export interface DocParaTope {
  id: number;
  id_centro_costo: number | null;
  clase_documento: string | null;
  estado: string;
  neto_proveedor: string;
  pagado_proveedor: string;
  programado_proveedor: string;
  /** Con contrato de valorización manda lo aprobado (plan 12), no el tope por avance del presupuesto. */
  tiene_contrato?: boolean;
}

export interface LineaValorizada {
  id: number;
  descripcion: string | null;
  id_subfase: number | null;
  subfase: string | null;
  monto: number;
  /** Avance real (0-100) de la subfase en el Control de Avance; `null` si la obra no la tiene. */
  avance_pct: number | null;
  /** Monto × avance: lo que ya vale lo ejecutado. */
  monto_valorizado: number;
}

export interface InfoTope {
  adelanto_porcentaje: number;
  avance_pct: number;
  pct_aplicado: number;
  tope: number;
  pagado: number;
  programado: number;
  /** Lo que el avance ya liberó y todavía no se paga ni se programa. */
  disponible: number;
  /** Monto que la programación propone: el adelanto al inicio y, después, lo disponible. */
  sugerido: number;
  lineas: LineaValorizada[];
}

/**
 * Topes por avance de las órdenes de servicio que nacieron de un presupuesto (plan 09, D-13). Solo devuelve entrada para esas
 * órdenes (`ORDEN_SERVICIO` registrada, de un FUR de adjudicación): las demás se pagan como siempre (las OC de bienes, desde la recepción).
 */
export async function cargarTopesAvance(sql: AlmacenSql, orm: OrmObra, docs: readonly DocParaTope[]): Promise<Map<number, InfoTope>> {
  const resultado = new Map<number, InfoTope>();
  const candidatos = docs.filter((d) => d.clase_documento === 'ORDEN_SERVICIO' && d.estado === 'REGISTRADO' && !d.tiene_contrato);
  if (candidatos.length === 0) return resultado;
  const q = sqlTag(sql);
  const lista = csv(candidatos.map((d) => d.id));

  const delPresupuesto = await q.rows<{ id: number; adelanto: string | null }>({ id: I, adelanto: TN })`
    SELECT o.id, c.adelanto_porcentaje::text AS adelanto
      FROM "documentosOrigen" o
      JOIN requerimiento r ON r.id = o.id_requerimiento AND r.origen::text = 'PPTO_ADJUDICACION'
      LEFT JOIN cotizacion c ON c.id = o.id_cotizacion
     WHERE o.id = ANY(string_to_array(${lista}::text, ',')::int[])`;
  if (delPresupuesto.length === 0) return resultado;
  const adelanto = new Map(delPresupuesto.map((d) => [d.id, Number(d.adelanto ?? 0)]));

  const lineas = await q.rows<{ id_doc: number; id: number; descripcion: string | null; id_subfase: number | null; subfase: string | null; monto: string }>(
    { id_doc: I, id: I, descripcion: TN, id_subfase: IN, subfase: TN, monto: T },
  )`
    SELECT od.id_orden_compra AS id_doc, od.id, p.descripcion::text AS descripcion,
           COALESCE(od.id_ppto_detalle_categoria, rd.id_ppto_detalle_categoria) AS id_subfase,
           (SELECT fc."Descripcion"::text FROM "ppto_DetalleFasesCate" c
              JOIN "ppto_FasesCategorias" fc ON fc."IdpptoFaseCategoria" = c."IdpptoFaseCategoria"
             WHERE c.id = COALESCE(od.id_ppto_detalle_categoria, rd.id_ppto_detalle_categoria) LIMIT 1) AS subfase,
           COALESCE(od.monto, 0)::text AS monto
      FROM "ordenCompraDetalle" od
      LEFT JOIN requerimiento_detalle rd ON rd.id = od.id_requerimiento_detalle
      LEFT JOIN producto p ON p.id = od.id_producto
     WHERE od.id_orden_compra = ANY(string_to_array(${csv(delPresupuesto.map((d) => d.id))}::text, ',')::int[])
     ORDER BY od.id`;

  // Una versión nueva del presupuesto reemplaza las subfases de la obra: la línea de una orden anterior busca también las de sus descendientes.
  const equivalentes = await subfasesDeLineas(sql, lineas.map((l) => l.id));
  const cacheObra = new Map<number, Map<number, number>>();
  for (const d of candidatos) {
    if (!adelanto.has(d.id)) continue;
    let avances = new Map<number, number>();
    if (d.id_centro_costo !== null) {
      if (!cacheObra.has(d.id_centro_costo)) cacheObra.set(d.id_centro_costo, await avancesPorSubfase(orm, d.id_centro_costo));
      avances = cacheObra.get(d.id_centro_costo)!;
    }
    const detalle: LineaValorizada[] = lineas
      .filter((l) => l.id_doc === d.id)
      .map((l) => {
        const avance = avanceDeLinea(l.id_subfase, equivalentes.get(l.id) ?? [], avances);
        const monto = Number(l.monto);
        return {
          id: l.id,
          descripcion: l.descripcion,
          id_subfase: l.id_subfase,
          subfase: l.subfase,
          monto,
          avance_pct: avance,
          monto_valorizado: redondear((monto * (avance ?? 0)) / 100),
        };
      });
    const neto = Number(d.neto_proveedor);
    const pagado = Number(d.pagado_proveedor);
    const programado = Number(d.programado_proveedor);
    const t = topeAvance(neto, adelanto.get(d.id) ?? 0, detalle.map<LineaTope>((l) => ({ monto: l.monto, avance: l.avance_pct })));
    resultado.set(d.id, {
      adelanto_porcentaje: t.adelantoPct,
      avance_pct: t.avancePct,
      pct_aplicado: t.pctAplicado,
      tope: t.tope,
      pagado,
      programado,
      disponible: disponibleAvance(t.tope, pagado, programado),
      sugerido: montoSugerido(neto, t.adelantoPct, t.tope, pagado, programado),
      lineas: detalle,
    });
  }
  return resultado;
}
