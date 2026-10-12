import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';

/** Filtros de la consulta de documentos de origen; `undefined` = sin filtrar. */
export interface FiltrosDocumentos {
  id?: number;
  search?: string;
  clase_documento?: string;
  estado?: string;
  estado_pago?: string;
  monto_min?: number;
  monto_max?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  vence_desde?: string;
  vence_hasta?: string;
  id_centro_costo?: number;
  id_centro_costos_principal?: number;
  id_area?: number;
  id_anexo?: number;
  id_requerimiento?: number;
  /** Solo documentos con saldo por programar (proveedor o detraccion). */
  con_saldo_por_programar?: boolean;
}

export interface DocumentoConsultado {
  id: number;
  numero_documento: string | null;
  numero_oc: string | null;
  clase_documento: string | null;
  estado: string;
  id_anexo: number | null;
  proveedor: string | null;
  ruc: string | null;
  id_centro_costo: number | null;
  centro_costo: string | null;
  id_centro_costos_principal: number | null;
  centro_costo_principal: string | null;
  id_area: number | null;
  area_nombre: string | null;
  id_requerimiento: number | null;
  numero_requerimiento: string | null;
  fecha_emision: string | null;
  forma_pago: string | null;
  moneda_id: string | null;
  moneda_simbolo: string | null;
  afecto_igv: boolean;
  monto: string;
  igv: string;
  total: string;
  renta_4ta: string;
  dscto_compras: string;
  dscto_intervencion: string;
  dscto_otros: string;
  detraccion_porcentaje: string | null;
  detraccion_monto: string | null;
  retencion_porcentaje: string | null;
  retencion_monto: string | null;
  retencion_manual: boolean;
  comentarios: string | null;
  dias_credito: number | null;
  fecha_vencimiento_manual: string | null;
  ultima_recepcion: string | null;
  vencimiento: string | null;
  pendiente_recepcion: boolean;
  neto_proveedor: string;
  pagado_proveedor: string;
  pagado_detraccion: string;
  programado_proveedor: string;
  programado_detraccion: string;
  saldo_por_pagar_proveedor: string;
  saldo_por_pagar_detraccion: string;
  fecha_ultimo_pago: string | null;
  estado_pago: string;
  total_filas: number;
}

const SPEC = {
  id: I,
  numero_documento: TN,
  numero_oc: TN,
  clase_documento: TN,
  estado: T,
  id_anexo: IN,
  proveedor: TN,
  ruc: TN,
  id_centro_costo: IN,
  centro_costo: TN,
  id_centro_costos_principal: IN,
  centro_costo_principal: TN,
  id_area: IN,
  area_nombre: TN,
  id_requerimiento: IN,
  numero_requerimiento: TN,
  fecha_emision: TN,
  forma_pago: TN,
  moneda_id: TN,
  moneda_simbolo: TN,
  afecto_igv: B,
  monto: T,
  igv: T,
  total: T,
  renta_4ta: T,
  dscto_compras: T,
  dscto_intervencion: T,
  dscto_otros: T,
  detraccion_porcentaje: TN,
  detraccion_monto: TN,
  retencion_porcentaje: TN,
  retencion_monto: TN,
  retencion_manual: B,
  comentarios: TN,
  dias_credito: IN,
  fecha_vencimiento_manual: TN,
  ultima_recepcion: TN,
  vencimiento: TN,
  pendiente_recepcion: B,
  neto_proveedor: T,
  pagado_proveedor: T,
  pagado_detraccion: T,
  programado_proveedor: T,
  programado_detraccion: T,
  saldo_por_pagar_proveedor: T,
  saldo_por_pagar_detraccion: T,
  fecha_ultimo_pago: TN,
  estado_pago: T,
  total_filas: I,
} as const;

/**
 * Consulta unica de documentos de origen con neto a pagar, vencimiento y estado de pago calculados (plan 06 §3, §5.5).
 * Los filtros y la paginacion se aplican sobre los valores calculados, por eso todo vive en un solo SQL.
 */
export async function consultarDocumentos(
  sql: AlmacenSql,
  f: FiltrosDocumentos,
  limit: number,
  offset: number,
  tx?: Tx,
): Promise<DocumentoConsultado[]> {
  const q = sqlTag(sql);
  const id = f.id ?? 0;
  const patron = `%${f.search ?? ''}%`;
  const clase = f.clase_documento ?? '';
  const estado = f.estado ?? '';
  const estadoPago = f.estado_pago ?? '';
  const montoMin = String(f.monto_min ?? -1);
  const montoMax = String(f.monto_max ?? 1e15);
  const fDesde = f.fecha_desde ?? '1900-01-01';
  const fHasta = f.fecha_hasta ?? '9999-12-31';
  const vDesde = f.vence_desde ?? '1900-01-01';
  const vHasta = f.vence_hasta ?? '9999-12-31';
  const filtraVence = f.vence_desde !== undefined || f.vence_hasta !== undefined;
  const cc = f.id_centro_costo ?? 0;
  const ccp = f.id_centro_costos_principal ?? 0;
  const area = f.id_area ?? 0;
  const anexo = f.id_anexo ?? 0;
  const req = f.id_requerimiento ?? 0;
  const soloSaldo = f.con_saldo_por_programar ?? false;

  return q.rows<DocumentoConsultado>(SPEC, tx)`
    SELECT d.id, d.numero_documento, d.numero_oc, d.clase_documento, d.estado, d.id_anexo, d.proveedor, d.ruc,
           d.id_centro_costo, d.centro_costo, d.id_centro_costos_principal, d.centro_costo_principal, d.id_area, d.area_nombre,
           d.id_requerimiento, d.numero_requerimiento, d.fecha_emision, d.forma_pago, d.moneda_id, d.moneda_simbolo, d.afecto_igv,
           d.monto, d.igv, d.total, d.renta_4ta, d.dscto_compras, d.dscto_intervencion, d.dscto_otros,
           d.detraccion_porcentaje, d.detraccion_monto, d.retencion_porcentaje, d.retencion_monto, d.retencion_manual, d.comentarios,
           d.dias_credito, d.fecha_vencimiento_manual, d.ultima_recepcion, d.vencimiento, d.pendiente_recepcion,
           d.neto_proveedor::text AS neto_proveedor, d.pagado_proveedor::text AS pagado_proveedor,
           d.pagado_detraccion::text AS pagado_detraccion, d.programado_proveedor::text AS programado_proveedor,
           d.programado_detraccion::text AS programado_detraccion,
           GREATEST(d.neto_proveedor - d.pagado_proveedor, 0)::text AS saldo_por_pagar_proveedor,
           GREATEST(d.det - d.pagado_detraccion, 0)::text AS saldo_por_pagar_detraccion,
           d.fecha_ultimo_pago, d.estado_pago, (count(*) OVER ())::int AS total_filas
      FROM (
        SELECT y.*,
               CASE WHEN y.estado = 'ANULADO' THEN 'ANULADO'
                    WHEN (y.neto_proveedor > 0.005 OR y.det > 0.005)
                         AND y.pagado_proveedor >= y.neto_proveedor - 0.005 AND y.pagado_detraccion >= y.det - 0.005 THEN 'PAGADO'
                    WHEN y.pagado_proveedor > 0 OR y.pagado_detraccion > 0 THEN 'PARCIAL'
                    WHEN y.programado_proveedor > 0 OR y.programado_detraccion > 0 THEN 'PROGRAMADO'
                    ELSE 'SIN_PROGRAMAR' END AS estado_pago
          FROM (
            SELECT x.*,
                   COALESCE(x.detraccion_monto_n, 0) AS det,
                   ROUND(x.total_n - x.renta_n - x.dc_n - x.di_n - x.do_n
                         - COALESCE(x.total_n * x.detraccion_pct_n / 100, 0) - COALESCE(x.retencion_n, 0), 2) AS neto_proveedor,
                   CASE WHEN x.fecha_vencimiento_manual IS NOT NULL THEN x.fecha_vencimiento_manual
                        WHEN x.dias_efectivos IS NULL THEN NULL
                        WHEN x.clase_documento = 'ORDEN_COMPRA' THEN (x.ultima_recepcion::date + x.dias_efectivos)::text
                        ELSE (x.fecha_emision::date + x.dias_efectivos)::text END AS vencimiento,
                   (x.clase_documento = 'ORDEN_COMPRA' AND x.fecha_vencimiento_manual IS NULL AND x.ultima_recepcion IS NULL) AS pendiente_recepcion
              FROM (
                SELECT o.id, o.numero_documento::text AS numero_documento, o.numero_oc::text AS numero_oc,
                       o.clase_documento::text AS clase_documento, o.estado::text AS estado, o.id_anexo,
                       COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, a."NumeroDocIde"::text AS ruc,
                       o.id_centro_costo, cc.centro_costo::text AS centro_costo, cc.id_centro_costos_principal,
                       ccp.descripcion::text AS centro_costo_principal, o.id_area, ar.nombre::text AS area_nombre,
                       o.id_requerimiento, r.numero::text AS numero_requerimiento, o.fecha_emision::date::text AS fecha_emision,
                       o.forma_pago::text AS forma_pago, o.moneda_id::text AS moneda_id, o.moneda_simbolo::text AS moneda_simbolo,
                       o.afecto_igv, COALESCE(o.monto, 0)::text AS monto, COALESCE(o.igv, 0)::text AS igv,
                       COALESCE(o.total, 0)::text AS total, COALESCE(o.renta_4ta, 0)::text AS renta_4ta,
                       COALESCE(o.dscto_compras, 0)::text AS dscto_compras, COALESCE(o.dscto_intervencion, 0)::text AS dscto_intervencion,
                       COALESCE(o.dscto_otros, 0)::text AS dscto_otros, o.detraccion_porcentaje::text AS detraccion_porcentaje,
                       o.detraccion_monto::text AS detraccion_monto, o.retencion_porcentaje::text AS retencion_porcentaje,
                       o.retencion_monto::text AS retencion_monto, o.retencion_manual, o.comentarios,
                       o.dias_credito, o.fecha_vencimiento::text AS fecha_vencimiento_manual,
                       COALESCE(o.dias_credito,
                                CASE WHEN o.forma_pago ILIKE '%contado%' THEN 0
                                     WHEN o.forma_pago ILIKE '%mayor%' THEN NULL
                                     ELSE NULLIF(substring(o.forma_pago from '[0-9]+'), '')::int END) AS dias_efectivos,
                       (SELECT max(g.fecha)::text FROM almacen_documento g
                         WHERE g.id_orden_compra = o.id AND g.estado = 'REGISTRADO' AND g.motivo = 'COMPRA') AS ultima_recepcion,
                       COALESCE(o.total, 0) AS total_n, COALESCE(o.renta_4ta, 0) AS renta_n, COALESCE(o.dscto_compras, 0) AS dc_n,
                       COALESCE(o.dscto_intervencion, 0) AS di_n, COALESCE(o.dscto_otros, 0) AS do_n,
                       o.detraccion_porcentaje AS detraccion_pct_n, o.detraccion_monto AS detraccion_monto_n, o.retencion_monto AS retencion_n,
                       COALESCE((SELECT sum(p.monto) FROM pago p WHERE p.id_documento_origen = o.id AND p.estado = 'REGISTRADO'
                                  AND p.concepto = 'PROVEEDOR'), 0) AS pagado_proveedor,
                       COALESCE((SELECT sum(p.monto) FROM pago p WHERE p.id_documento_origen = o.id AND p.estado = 'REGISTRADO'
                                  AND p.concepto = 'DETRACCION'), 0) AS pagado_detraccion,
                       COALESCE((SELECT sum(g.monto) FROM pago_programado g WHERE g.id_documento_origen = o.id AND g.estado = 'PROGRAMADO'
                                  AND g.concepto = 'PROVEEDOR'), 0) AS programado_proveedor,
                       COALESCE((SELECT sum(g.monto) FROM pago_programado g WHERE g.id_documento_origen = o.id AND g.estado = 'PROGRAMADO'
                                  AND g.concepto = 'DETRACCION'), 0) AS programado_detraccion,
                       (SELECT max(p.fecha_pago)::text FROM pago p WHERE p.id_documento_origen = o.id AND p.estado = 'REGISTRADO') AS fecha_ultimo_pago
                  FROM "documentosOrigen" o
                  LEFT JOIN anexos a ON a.id = o.id_anexo
                  LEFT JOIN "CentroCostos" cc ON cc.id = o.id_centro_costo
                  LEFT JOIN centro_costos_principal ccp ON ccp.id = cc.id_centro_costos_principal
                  LEFT JOIN area ar ON ar.id = o.id_area
                  LEFT JOIN requerimiento r ON r.id = o.id_requerimiento
              ) x
          ) y
      ) d
     WHERE (${id}::int = 0 OR d.id = ${id}::int)
       AND (${patron}::text = '%%' OR d.numero_documento ILIKE ${patron}::text OR d.numero_oc ILIKE ${patron}::text
            OR d.proveedor ILIKE ${patron}::text OR d.comentarios ILIKE ${patron}::text OR d.numero_requerimiento ILIKE ${patron}::text)
       AND (${clase}::text = '' OR d.clase_documento = ${clase}::text)
       AND (${estado}::text = '' OR d.estado = ${estado}::text)
       AND (${estadoPago}::text = '' OR d.estado_pago = ${estadoPago}::text)
       AND d.total::numeric >= ${montoMin}::numeric AND d.total::numeric <= ${montoMax}::numeric
       AND (d.fecha_emision IS NULL OR (d.fecha_emision::date >= ${fDesde}::date AND d.fecha_emision::date <= ${fHasta}::date))
       AND (${filtraVence}::boolean = false OR (d.vencimiento IS NOT NULL AND d.vencimiento::date >= ${vDesde}::date
                                                 AND d.vencimiento::date <= ${vHasta}::date))
       AND (${cc}::int = 0 OR d.id_centro_costo = ${cc}::int)
       AND (${ccp}::int = 0 OR d.id_centro_costos_principal = ${ccp}::int)
       AND (${area}::int = 0 OR d.id_area = ${area}::int)
       AND (${anexo}::int = 0 OR d.id_anexo = ${anexo}::int)
       AND (${req}::int = 0 OR d.id_requerimiento = ${req}::int)
       AND (${soloSaldo}::boolean = false OR (d.estado = 'REGISTRADO'
            AND (d.neto_proveedor - d.pagado_proveedor - d.programado_proveedor > 0.005
                 OR d.det - d.pagado_detraccion - d.programado_detraccion > 0.005)))
     ORDER BY d.id DESC
     LIMIT ${limit}::int OFFSET ${offset}::int`;
}

/** Bloquea el documento (`FOR UPDATE`) y devuelve su estado de pago visto desde la propia transaccion. */
export async function bloquearYConsultar(sql: AlmacenSql, tx: Tx, id: number): Promise<DocumentoConsultado | null> {
  const q = sqlTag(sql);
  await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "documentosOrigen" WHERE id = ${id}::int FOR UPDATE`;
  const [doc] = await consultarDocumentos(sql, { id }, 1, 0, tx);
  return doc ?? null;
}
