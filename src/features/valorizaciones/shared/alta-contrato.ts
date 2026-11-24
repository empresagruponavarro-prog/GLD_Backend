import { AlmacenSql, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { hoyLima } from '../../operaciones-obra/shared/obra-shared.js';
import { contratoDeDocumento, leerDocumento } from './datos.js';
import { altaAutomatica as modoAutomatico } from './modo-alta.js';

/**
 * Alta de un contrato de valorización para una orden de servicio (plan 12, D-3). Es una función libre —no un servicio de Nest— para que
 * `presupuestos` y `documentos` la usen sin importar el módulo de valorizaciones (evita ciclos). **Nunca lanza por reglas de negocio:**
 * devuelve el `motivo` por el que no se pudo; quien la llama a mano lo convierte en un error y la automática lo ignora.
 */

export interface ResultadoAlta {
  id: number | null;
  creado: boolean;
  motivo: string | null;
}

/** Condiciones que propone el sistema: las del tipo de servicio de la línea de mayor monto, o las generales; el adelanto de la cotización manda. */
export interface CondicionesPropuestas {
  adelantoPorcentaje: number;
  garantiaPorcentaje: number;
  numeroValorizaciones: number;
  mesesGarantia: number;
  /** Descuento fijo (S/ con IGV) si la obra queda fuera de Lima Metropolitana; 0 = no aplica. */
  descuentoFueraLima: number;
  alcances: string | null;
  condicionesGenerales: string | null;
  condicionesComerciales: string | null;
}

export async function condicionesPorDefecto(sql: AlmacenSql, idDocumento: number, idCotizacion: number | null, tx?: Tx): Promise<CondicionesPropuestas> {
  const q = sqlTag(sql);
  const [c] = await q.rows<Record<string, string | number | null>>(
    { adelanto: T, garantia: T, numero: I, meses: I, fuera: T, generales: TN, comerciales: TN },
    tx,
  )`
    SELECT cs.adelanto_porcentaje::text AS adelanto, cs.garantia_porcentaje::text AS garantia, cs.numero_valorizaciones AS numero, cs.meses_garantia AS meses, cs.descuento_fuera_lima::text AS fuera,
           cs.condiciones_generales AS generales, cs.condiciones_comerciales AS comerciales
      FROM condicion_servicio cs
     WHERE cs.estado AND (cs.id_categoria IS NULL OR cs.id_categoria = (
             SELECT p.id_categoria FROM "ordenCompraDetalle" od JOIN producto p ON p.id = od.id_producto
              WHERE od.id_orden_compra = ${idDocumento}::int ORDER BY od.monto DESC NULLS LAST, od.id LIMIT 1))
     ORDER BY (cs.id_categoria IS NULL), cs.id LIMIT 1`;
  const [cot] = idCotizacion === null ? [] : await q.rows<{ adelanto: string | null }>({ adelanto: TN }, tx)`SELECT adelanto_porcentaje::text AS adelanto FROM cotizacion WHERE id = ${idCotizacion}::int`;
  return {
    adelantoPorcentaje: cot?.adelanto != null ? Number(cot.adelanto) : c ? Number(c['adelanto']) : 15,
    garantiaPorcentaje: c ? Number(c['garantia']) : 10,
    numeroValorizaciones: c ? (c['numero'] as number) : 3,
    mesesGarantia: c ? (c['meses'] as number) : 3,
    descuentoFueraLima: c ? Number(c['fuera']) : 0,
    alcances: null,
    condicionesGenerales: (c?.['generales'] as string | null) ?? null,
    condicionesComerciales: (c?.['comerciales'] as string | null) ?? null,
  };
}

/** Descripción del deductivo que se carga solo a los contratos de obras fuera de Lima Metropolitana. */
export const DESCUENTO_FUERA_LIMA = 'DESCUENTO FIJO POR INSTALACIÓN FUERA DE LIMA METROPOLITANA';

/**
 * ¿La obra está fuera de Lima Metropolitana? Lima Metropolitana es la provincia de Lima (ubigeo 1501). Sin distrito en la ficha de la obra
 * no se sabe: no se descuenta nada.
 */
export async function obraFueraDeLima(sql: AlmacenSql, idCentroCosto: number | null, tx?: Tx): Promise<boolean> {
  if (idCentroCosto === null) return false;
  const q = sqlTag(sql);
  const [r] = await q.rows<{ id: string | null }>({ id: TN }, tx)`
    SELECT d.id_provincia::text AS id FROM obra_datos_generales og JOIN distrito d ON d.id = og.id_distrito WHERE og.id_centro_costo = ${idCentroCosto}::int`;
  return r?.id != null && r.id !== '1501';
}

/** Supervisor por defecto: el residente, si no el coordinador y si no el jefe de proyecto de la obra. */
async function supervisorPorDefecto(sql: AlmacenSql, idCentroCosto: number | null, tx?: Tx): Promise<number | null> {
  if (idCentroCosto === null) return null;
  const q = sqlTag(sql);
  const [r] = await q.rows<{ id: number | null }>({ id: IN }, tx)`
    SELECT COALESCE(id_residente, id_coordinador, id_jefe_proyecto) AS id FROM obra_datos_generales WHERE id_centro_costo = ${idCentroCosto}::int`;
  return r?.id ?? null;
}

export async function altaContrato(sql: AlmacenSql, tx: Tx, idDocumento: number, quien: string): Promise<ResultadoAlta> {
  const no = (motivo: string): ResultadoAlta => ({ id: null, creado: false, motivo });
  const doc = await leerDocumento(sql, idDocumento, tx);
  if (!doc) return no('La orden no existe');
  const existente = await contratoDeDocumento(sql, idDocumento, tx);
  if (existente) return { id: existente.id, creado: false, motivo: 'La orden ya tiene contrato de valorización' };
  if (doc.clase !== 'ORDEN_SERVICIO') return no('Solo una orden de servicio lleva contrato de valorización');
  if (doc.estado !== 'REGISTRADO') return no(`La orden está ${doc.estado}: debe estar registrada`);
  if (doc.id_anexo === null) return no('La orden no tiene proveedor');
  if (doc.id_centro_costo === null) return no('La orden no tiene centro de costo');
  if (doc.lineas === 0) return no('La orden no tiene líneas');
  if (doc.descuentos > 0.005) return no('La orden tiene descuentos sueltos: con contrato se descuentan con deductivos; quítelos primero');

  const c = await condicionesPorDefecto(sql, idDocumento, doc.id_cotizacion, tx);
  const supervisor = await supervisorPorDefecto(sql, doc.id_centro_costo, tx);
  const q = sqlTag(sql);
  const [fila] = await q.rows<{ id: number }>({ id: I }, tx)`
    INSERT INTO contrato_valorizacion (id_documento_origen, estado, adelanto_porcentaje, garantia_porcentaje, numero_valorizaciones, meses_garantia,
                                       id_supervisor, condiciones_generales, condiciones_comerciales, registrado_por)
    VALUES (${idDocumento}::int, 'BORRADOR', ${String(c.adelantoPorcentaje)}::numeric, ${String(c.garantiaPorcentaje)}::numeric, ${c.numeroValorizaciones}::int,
            ${c.mesesGarantia}::int, NULLIF(${supervisor ?? 0}::int, 0), NULLIF(${c.condicionesGenerales ?? ''}::text, ''), NULLIF(${c.condicionesComerciales ?? ''}::text, ''), ${quien}::text)
    ON CONFLICT (id_documento_origen) DO NOTHING
    RETURNING id`;
  if (!fila) return no('La orden ya tiene contrato de valorización');
  if (c.descuentoFueraLima > 0.005 && (await obraFueraDeLima(sql, doc.id_centro_costo, tx))) {
    await q.run(tx)`
      INSERT INTO deductivo_proveedor (id_documento_origen, motivo, fecha, descripcion, monto, estado, registrado_por)
      VALUES (${idDocumento}::int, 'OTRO', ${hoyLima()}::date, ${DESCUENTO_FUERA_LIMA}::text, ${String(c.descuentoFueraLima)}::numeric, 'PENDIENTE', ${quien}::text)`;
  }
  return { id: fila.id, creado: true, motivo: null };
}

/** Alta automática: solo con `VALORIZACIONES_ALTA=automatica`. No falla nunca; se usa dentro de la transacción que registra las órdenes. */
export async function altaAutomaticaDeOrdenes(sql: AlmacenSql, tx: Tx, idsDocumento: readonly number[], quien: string): Promise<number> {
  if (!modoAutomatico()) return 0;
  let creados = 0;
  for (const id of idsDocumento) if ((await altaContrato(sql, tx, id, quien)).creado) creados += 1;
  return creados;
}
