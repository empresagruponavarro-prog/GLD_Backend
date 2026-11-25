import { ConflictException } from '@nestjs/common';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { ConversorSoles } from '../../tesoreria/shared/conversor-soles.js';
import { IGV_PCT } from '../../tesoreria/shared/tributos.js';

/** Cuántas cotizaciones hacen falta cuando la oferta supera el Meta (plan 12, D-17). */
export const COTIZACIONES_MINIMAS = 3;
const EPS = 0.005;

/** Marca que queda en el comentario de la adjudicación cuando se adjudica sin las 3 cotizaciones. */
export const MARCA_SIN_TRES = '[SIN 3 COTIZACIONES]';

export interface OpcionesSinTres {
  /** Quien adjudica reconoce que no hay 3 cotizaciones y lo hace igual: exige `motivo`. */
  sinTres?: boolean;
  motivo?: string | null;
}

/** Comentario de la adjudicación con la marca cuando se salta la regla (una sola vez). */
export function comentarioConMarca(motivo: string | null | undefined, sinTres: boolean | undefined): string | null {
  const t = (motivo ?? '').trim();
  if (!sinTres) return t === '' ? null : t;
  return t.startsWith(MARCA_SIN_TRES) ? t : `${MARCA_SIN_TRES} ${t}`;
}

/**
 * Regla de 1 o 3 cotizaciones (plan 12, R-03 y D-17): una cotización basta si su total (sin IGV, en soles) no supera el Meta de la subpartida;
 * si lo supera, hacen falta al menos 3. Con menos, 409 `COTIZACIONES_INSUFICIENTES`, salvo `sinTres` con el motivo. Si la oferta está en otra
 * moneda y no hay tipo de cambio no se puede comparar y también pide el motivo. Registrar ofertas sin adjudicar nunca dispara la regla.
 */
export async function exigirCotizacionesSuficientes(sql: AlmacenSql, tx: Tx, idSubpartida: number, idCotizacion: number, o: OpcionesSinTres): Promise<void> {
  const q = sqlTag(sql);
  const [conteo] = await q.rows<{ n: number }>({ n: I }, tx)`SELECT count(*)::int AS n FROM ppto_cotizacion WHERE id_detalle_categoria = ${idSubpartida}::int`;
  const n = conteo?.n ?? 0;
  if (n >= COTIZACIONES_MINIMAS) return;

  const [cot] = await q.rows<{ total: string; moneda_id: string | null; simbolo: string | null; incluye: boolean; afecto: boolean; fecha: string }>(
    { total: T, moneda_id: TN, simbolo: TN, incluye: B, afecto: B, fecha: T },
    tx,
  )`SELECT total_global::text AS total, moneda_id::text AS moneda_id, moneda_simbolo::text AS simbolo, incluye_igv AS incluye, afecto_igv AS afecto, fecha::text AS fecha
      FROM ppto_cotizacion WHERE id = ${idCotizacion}::int`;
  if (!cot) return;
  const [meta] = await q.rows<{ meta: string }>({ meta: T }, tx)`
    SELECT COALESCE(SUM(i."CostoTotalMeta"), 0)::text AS meta FROM "ppto_DetalleItems" i
     WHERE i.id_detalle_categoria = ${idSubpartida}::int AND COALESCE(i."Cantidad", 0) > 0`;

  const sinIgv = cot.incluye && cot.afecto ? Number(cot.total) / (1 + IGV_PCT / 100) : Number(cot.total);
  const conv = new ConversorSoles(sql);
  const enSoles = await conv.aSoles(sinIgv, cot.moneda_id, cot.simbolo, cot.fecha);
  const comparable = conv.sinTipoCambio === 0;
  if (comparable && enSoles <= Number(meta?.meta ?? 0) + EPS) return;

  if (o.sinTres) {
    if (!(o.motivo ?? '').trim()) throw new ConflictException({ codigo: 'MOTIVO_REQUERIDO', message: 'Adjudicar sin las 3 cotizaciones exige el motivo' });
    return;
  }
  throw new ConflictException({
    codigo: 'COTIZACIONES_INSUFICIENTES',
    message: comparable
      ? `La oferta (${enSoles.toFixed(2)} sin IGV, en soles) supera el Meta de la subpartida (${Number(meta?.meta ?? 0).toFixed(2)}) y solo hay ${n} de ${COTIZACIONES_MINIMAS} cotizaciones. Registre más cotizaciones o adjudique indicando el motivo (sin_tres_cotizaciones)`
      : `No se puede comparar la oferta con el Meta (falta el tipo de cambio de su moneda) y solo hay ${n} de ${COTIZACIONES_MINIMAS} cotizaciones. Registre el tipo de cambio o adjudique indicando el motivo (sin_tres_cotizaciones)`,
    cotizaciones: n,
    minimas: COTIZACIONES_MINIMAS,
    meta: Number(meta?.meta ?? 0).toFixed(2),
    oferta_soles: comparable ? enSoles.toFixed(2) : null,
  });
}

/** ¿La subpartida ya la gana esta cotización con todos sus ítems? (adjudicarla de nuevo no cambia nada). */
export async function yaGanaLaSubpartida(sql: AlmacenSql, tx: Tx, idSubpartida: number, idCotizacion: number): Promise<boolean> {
  const q = sqlTag(sql);
  const [r] = await q.rows<{ ganados: number; con_cantidad: number }>({ ganados: I, con_cantidad: I }, tx)`
    SELECT count(*) FILTER (WHERE d.id_cotizacion = ${idCotizacion}::int)::int AS ganados, count(*)::int AS con_cantidad
      FROM "ppto_DetalleItems" i LEFT JOIN ppto_cotizacion_detalle d ON d.id = i.id_ppto_cot_detalle_ganadora
     WHERE i.id_detalle_categoria = ${idSubpartida}::int AND COALESCE(i."Cantidad", 0) > 0`;
  return (r?.con_cantidad ?? 0) > 0 && r.ganados === r.con_cantidad;
}

export interface CondicionesSugeridas {
  adelanto_porcentaje: string;
  garantia_porcentaje: string;
  numero_valorizaciones: number;
  meses_garantia: number;
  /** Tipo de servicio (categoría del producto de mayor monto de la subpartida) de donde salieron; `null` = las generales. */
  id_categoria: number | null;
}

/**
 * Condiciones que se proponen al cotizar una subpartida (R-02, D-16): las del tipo de servicio de su ítem de mayor monto o, si esa categoría
 * no tiene fila, las generales. Sin ninguna fila configurada devuelve el 15 % de adelanto de uso común.
 */
export async function condicionesSugeridas(sql: AlmacenSql, idSubpartida: number, tx?: Tx): Promise<CondicionesSugeridas> {
  const q = sqlTag(sql);
  const [c] = await q.rows<{ adelanto: string; garantia: string; numero: number; meses: number; id_categoria: number | null }>(
    { adelanto: T, garantia: T, numero: I, meses: I, id_categoria: IN },
    tx,
  )`
    SELECT cs.adelanto_porcentaje::text AS adelanto, cs.garantia_porcentaje::text AS garantia, cs.numero_valorizaciones AS numero, cs.meses_garantia AS meses, cs.id_categoria
      FROM condicion_servicio cs
     WHERE cs.estado AND (cs.id_categoria IS NULL OR cs.id_categoria = (
             SELECT p.id_categoria FROM "ppto_DetalleItems" i JOIN producto p ON p.id = i.id_producto
              WHERE i.id_detalle_categoria = ${idSubpartida}::int ORDER BY i."CostoTotalMeta" DESC NULLS LAST, i.id LIMIT 1))
     ORDER BY (cs.id_categoria IS NULL), cs.id LIMIT 1`;
  return c
    ? { adelanto_porcentaje: c.adelanto, garantia_porcentaje: c.garantia, numero_valorizaciones: c.numero, meses_garantia: c.meses, id_categoria: c.id_categoria }
    : { adelanto_porcentaje: '15', garantia_porcentaje: '10', numero_valorizaciones: 3, meses_garantia: 3, id_categoria: null };
}
