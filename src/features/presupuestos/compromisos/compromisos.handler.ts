import { Injectable } from '@nestjs/common';
import { AlmacenSql, I, IN, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { leerPresupuesto } from '../cotizaciones-ppto/contexto-ppto.js';
import { conflictosPorOrigen } from './cobertura-origen.js';
import type { CompromisosPresupuestoDto } from './compromisos.dto.js';

/** Panel de compromisos del presupuesto (plan 09, §3.8): qué FUR y órdenes nacieron de la adjudicación y qué falta adjudicar. */
@Injectable()
export class CompromisosHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async listar(idPresupuesto: number): Promise<CompromisosPresupuestoDto> {
    const ppto = await leerPresupuesto(this.sql, idPresupuesto);
    const q = sqlTag(this.sql);

    const [conteo] = await q.rows<{ total: number; adjudicados: number }>({ total: I, adjudicados: I })`
      SELECT count(*)::int AS total, count(i.id_ppto_cot_detalle_ganadora)::int AS adjudicados
        FROM "ppto_DetalleItems" i WHERE i."IdPresupuesto" = ${ppto.codigo}::text AND i."Cantidad" > 0`;
    const faltan = await q.rows<{ id: number; codigo: string; descripcion: string; fase: string }>({ id: I, codigo: T, descripcion: T, fase: T })`
      SELECT i.id, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             COALESCE(m."FaseProyecto", f."IdpptoFase", 'Fase #' || f.id::text)::text AS fase
        FROM "ppto_DetalleItems" i
        JOIN producto p ON p.id = i.id_producto
        JOIN "ppto_DetalleFasesCate" c ON c.id = i.id_detalle_categoria
        JOIN "ppto_DetalleFases" f ON f."IdPresupuestoDetalle" = c."IdPresupuestoDetalle"
        LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = f."IdpptoFase"
       WHERE i."IdPresupuesto" = ${ppto.codigo}::text AND f."IdPresupuesto" = ${ppto.codigo}::text
         AND i."Cantidad" > 0 AND i.id_ppto_cot_detalle_ganadora IS NULL
       ORDER BY f.id, c.id, i."Orden", i.id`;

    const furs = await q.rows<{ id: number; numero: string; estado: string; fase: string | null; id_proveedor: number | null; proveedor: string | null; lineas: number }>(
      { id: I, numero: T, estado: T, fase: TN, id_proveedor: IN, proveedor: TN, lineas: I },
    )`
      SELECT r.id, r.numero::text AS numero, r.estado::text AS estado, m."FaseProyecto"::text AS fase, cq.id_proveedor,
             COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor,
             (SELECT count(*)::int FROM requerimiento_detalle x WHERE x.id_requerimiento = r.id) AS lineas
        FROM requerimiento r
        LEFT JOIN "ppto_Fases" m ON m.id = r.id_fase
        LEFT JOIN cotizacion cq ON cq.id = r.id_cotizacion_ganadora
        LEFT JOIN anexos a ON a.id = cq.id_proveedor
       WHERE r.id_ppto_principal = ${ppto.id}::int AND r.origen::text = 'PPTO_ADJUDICACION'
       ORDER BY r.id`;
    const docs = furs.length
      ? await q.rows<{ id: number; id_requerimiento: number; numero_documento: string; clase: string; estado: string; total: string; moneda_simbolo: string | null; fecha_emision: string | null }>(
          { id: I, id_requerimiento: I, numero_documento: T, clase: T, estado: T, total: T, moneda_simbolo: TN, fecha_emision: TN },
        )`
          SELECT id, id_requerimiento, COALESCE(numero_documento, '')::text AS numero_documento, COALESCE(clase_documento::text, '') AS clase,
                 estado::text AS estado, COALESCE(total, 0)::text AS total, moneda_simbolo::text AS moneda_simbolo, fecha_emision::date::text AS fecha_emision
            FROM "documentosOrigen"
           WHERE id_requerimiento = ANY(string_to_array(${csv(furs.map((f) => f.id))}::text, ',')::int[]) ORDER BY id`
      : [];

    return {
      id_presupuesto: ppto.id,
      codigo_presupuesto: ppto.codigo,
      estado: ppto.estado,
      items_total: conteo.total,
      items_adjudicados: conteo.adjudicados,
      items_sin_adjudicar: faltan.map((f) => ({ id_ppto_item: f.id, codigo: f.codigo, descripcion: f.descripcion, fase: f.fase })),
      conflictos: (await conflictosPorOrigen(this.sql, ppto.codigo)).map((c) => ({ id_ppto_item: c.id_ppto_item, codigo: c.codigo, documentos: c.documentos })),
      compromisos: furs.map((f) => {
        const propios = docs.filter((d) => d.id_requerimiento === f.id);
        const vigentes = propios.filter((d) => d.estado !== 'ANULADO');
        const estadoCompromiso =
          f.estado === 'ANULADO' || (vigentes.length === 0 && propios.length > 0) ? 'ANULADO' : vigentes.some((d) => d.estado === 'REGISTRADO') ? 'REGISTRADO' : 'PROVISIONAL';
        return {
          id_requerimiento: f.id,
          numero: f.numero,
          estado_requerimiento: f.estado,
          estado: estadoCompromiso,
          fase: f.fase,
          id_proveedor: f.id_proveedor,
          proveedor: f.proveedor,
          lineas: f.lineas,
          documentos: propios.map((d) => ({
            id: d.id,
            numero_documento: d.numero_documento,
            clase: d.clase,
            estado: d.estado,
            total: d.total,
            moneda_simbolo: d.moneda_simbolo,
            fecha_emision: d.fecha_emision,
          })),
        };
      }),
    };
  }
}
