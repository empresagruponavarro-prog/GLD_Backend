import { AlmacenSql, I, IN, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { preciosOferta } from '../../requerimientos/shared/precios-oferta.js';
import { redondear } from '../../tesoreria/shared/tributos.js';
import { compromisosDeItems, estaCubierto, type CompromisoItem } from './contexto-ppto.js';

/** Lo que el diálogo de ítems del presupuesto muestra de cada ítem: cuántas cotizaciones tiene, quién gana y qué se generó. */
export interface ResumenCotizacionItem {
  cotizaciones: number;
  adjudicado: {
    id_cotizacion: number;
    id_cot_detalle: number;
    numero_cotizacion: string;
    id_proveedor: number;
    proveedor: string | null;
    moneda_id: string;
    moneda_simbolo: string | null;
    /** Precio unitario sin IGV del ganador, tal cual lo cotizó (en su moneda). */
    precio_sin_igv: string;
    adjudicado_por: string | null;
    fecha_adjudicacion: string | null;
  } | null;
  compromiso: CompromisoItem | null;
  /** El ítem ya tiene una orden registrada: no cambia de proveedor ni se borra. */
  cubierto: boolean;
}

/** Resumen de cotizaciones por ítem (id del ítem -> resumen). Los ítems sin nada devuelven ceros. */
export async function resumenCotizacionDeItems(sql: AlmacenSql, ids: number[], tx?: Tx): Promise<Map<number, ResumenCotizacionItem>> {
  const resultado = new Map<number, ResumenCotizacionItem>();
  if (ids.length === 0) return resultado;
  const q = sqlTag(sql);
  const lista = csv(ids);

  const filas = await q.rows<{
    id: number;
    cotizaciones: number;
    id_cotizacion: number | null;
    id_cot_detalle: number | null;
    numero: string | null;
    id_proveedor: number | null;
    proveedor: string | null;
    moneda_id: string | null;
    moneda_simbolo: string | null;
    precio_unitario: string | null;
    incluye_igv: boolean | null;
    afecto_igv: boolean | null;
    adjudicado_por: string | null;
    fecha_adjudicacion: string | null;
  }>(
    {
      id: I,
      cotizaciones: I,
      id_cotizacion: IN,
      id_cot_detalle: IN,
      numero: TN,
      id_proveedor: IN,
      proveedor: TN,
      moneda_id: TN,
      moneda_simbolo: TN,
      precio_unitario: TN,
      incluye_igv: { codecId: 'pg/bool@1', nullable: true },
      afecto_igv: { codecId: 'pg/bool@1', nullable: true },
      adjudicado_por: TN,
      fecha_adjudicacion: TN,
    },
    tx,
  )`
    SELECT i.id,
           (SELECT count(*)::int FROM ppto_cotizacion_detalle x WHERE x.id_ppto_item = i.id AND x.cotiza) AS cotizaciones,
           c.id AS id_cotizacion, g.id AS id_cot_detalle, c.numero::text AS numero, c.id_proveedor,
           COALESCE(a."NombreComercial", a."Anexo")::text AS proveedor, c.moneda_id::text AS moneda_id,
           c.moneda_simbolo::text AS moneda_simbolo, g.precio_unitario::text AS precio_unitario, c.incluye_igv, c.afecto_igv,
           i.adjudicado_por::text AS adjudicado_por, i.fecha_adjudicacion::text AS fecha_adjudicacion
      FROM "ppto_DetalleItems" i
      LEFT JOIN ppto_cotizacion_detalle g ON g.id = i.id_ppto_cot_detalle_ganadora
      LEFT JOIN ppto_cotizacion c ON c.id = g.id_cotizacion
      LEFT JOIN anexos a ON a.id = c.id_proveedor
     WHERE i.id = ANY(string_to_array(${lista}::text, ',')::int[])`;

  const compromisos = await compromisosDeItems(sql, ids, tx);
  for (const f of filas) {
    const compromiso = compromisos.get(f.id) ?? null;
    resultado.set(f.id, {
      cotizaciones: f.cotizaciones,
      adjudicado:
        f.id_cot_detalle === null || f.id_cotizacion === null
          ? null
          : {
              id_cotizacion: f.id_cotizacion,
              id_cot_detalle: f.id_cot_detalle,
              numero_cotizacion: f.numero ?? '',
              id_proveedor: f.id_proveedor ?? 0,
              proveedor: f.proveedor,
              moneda_id: f.moneda_id ?? '',
              moneda_simbolo: f.moneda_simbolo,
              precio_sin_igv: redondear(preciosOferta(Number(f.precio_unitario ?? 0), f.incluye_igv ?? false, f.afecto_igv ?? true).sin, 4).toFixed(4),
              adjudicado_por: f.adjudicado_por,
              fecha_adjudicacion: f.fecha_adjudicacion,
            },
      compromiso,
      cubierto: estaCubierto(compromiso ?? undefined),
    });
  }
  return resultado;
}

