import { AlmacenSql, T, TN, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { tcVigente, claveMoneda } from '../../tesoreria/shared/tipo-cambio.js';
import { esSoles } from '../../tesoreria/shared/tributos.js';

/**
 * Gasto de una obra frente al presupuesto Meta, **por subfase** (GRP S-09, SP-08). No se guarda: se calcula al leer a
 * partir de lo que registra la gente (OC/OS con su subfase y PECOSA).
 *
 * Tres tipos de gasto, sin contar dos veces:
 * - **Directo**: lo que no pasa por almacén (líneas de servicio de las OC/OS no anuladas).
 * - **Indirecto**: lo que sale de almacén a la obra (PECOSA = cantidad × costo de la salida, ya con el costo promedio).
 * - **Compromiso**: bienes comprados (OC no anuladas) que todavía no salieron: `OC de bienes − indirecto`, sin bajar de 0.
 *   Lo que ya salió se cuenta como indirecto, no otra vez como compromiso.
 */

export interface LineaCompra {
  /** `ppto_DetalleFasesCate.id`; `null` = la línea no se imputó a una subfase. */
  subfase: number | null;
  /** `true` = servicio (gasto directo); `false` = bien (va a almacén). */
  esServicio: boolean;
  /** Subtotal de la línea en soles, sin IGV. */
  monto: number;
}

export interface SalidaConsumo {
  subfase: number | null;
  /** Cantidad × costo de la salida, en soles. */
  costo: number;
}

export interface MetaSubfase {
  id: number;
  nombre: string;
  /** Monto de la subpartida en el presupuesto Meta. */
  meta: number;
}

export interface GastoSubfase {
  id_ppto_detalle_categoria: number | null;
  subfase: string;
  meta: number | null;
  directo: number;
  indirecto: number;
  compromiso: number;
  /** Directo + indirecto. */
  ejecutado: number;
  /** Ejecutado + compromiso. */
  proyectado: number;
  /** Meta − proyectado; `null` si la subfase no tiene meta. */
  saldo: number | null;
  /** El proyectado supera la meta. */
  sobre_meta: boolean;
}

export interface TotalesGasto {
  meta: number;
  directo: number;
  indirecto: number;
  compromiso: number;
  ejecutado: number;
  proyectado: number;
  saldo: number;
}

export interface GastoObra {
  id_centro_costo: number;
  subfases: GastoSubfase[];
  total: TotalesGasto;
  /** Líneas en otra moneda que no se pudieron convertir por no haber tipo de cambio: no están en las sumas. */
  lineas_sin_tipo_cambio: number;
}

const SIN_SUBFASE = 'Sin subfase';
const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Puro: arma el gasto por subfase. El orden es el de las metas, luego las demás subfases, y «Sin subfase» al final. */
export function calcularGastoSubfase(
  idCentroCosto: number,
  metas: readonly MetaSubfase[],
  compras: readonly LineaCompra[],
  salidas: readonly SalidaConsumo[],
  nombres: ReadonlyMap<number, string> = new Map(),
  lineasSinTipoCambio = 0,
): GastoObra {
  type Acumulado = { directo: number; ocBienes: number; indirecto: number };
  const acumulado = new Map<number | null, Acumulado>();
  const de = (id: number | null): Acumulado => {
    let a = acumulado.get(id);
    if (!a) acumulado.set(id, (a = { directo: 0, ocBienes: 0, indirecto: 0 }));
    return a;
  };
  for (const c of compras) {
    if (c.esServicio) de(c.subfase).directo += c.monto;
    else de(c.subfase).ocBienes += c.monto;
  }
  for (const s of salidas) de(s.subfase).indirecto += s.costo;

  const metaPorId = new Map(metas.map((m) => [m.id, m]));
  const orden: Array<number | null> = [...metas.map((m) => m.id)];
  for (const id of acumulado.keys()) if (id !== null && !metaPorId.has(id)) orden.push(id);
  if (acumulado.has(null)) orden.push(null);

  const subfases: GastoSubfase[] = orden.map((id) => {
    const a = acumulado.get(id) ?? { directo: 0, ocBienes: 0, indirecto: 0 };
    const meta = id === null ? null : (metaPorId.get(id)?.meta ?? null);
    const directo = redondear(a.directo);
    const indirecto = redondear(a.indirecto);
    const compromiso = redondear(Math.max(a.ocBienes - a.indirecto, 0));
    const ejecutado = redondear(directo + indirecto);
    const proyectado = redondear(ejecutado + compromiso);
    return {
      id_ppto_detalle_categoria: id,
      subfase: id === null ? SIN_SUBFASE : (metaPorId.get(id)?.nombre ?? nombres.get(id) ?? `Subfase #${id}`),
      meta: meta === null ? null : redondear(meta),
      directo,
      indirecto,
      compromiso,
      ejecutado,
      proyectado,
      saldo: meta === null ? null : redondear(meta - proyectado),
      sobre_meta: meta !== null && proyectado > meta,
    };
  });

  const suma = (f: (s: GastoSubfase) => number) => redondear(subfases.reduce((acc, s) => acc + f(s), 0));
  const total: TotalesGasto = {
    meta: suma((s) => s.meta ?? 0),
    directo: suma((s) => s.directo),
    indirecto: suma((s) => s.indirecto),
    compromiso: suma((s) => s.compromiso),
    ejecutado: suma((s) => s.ejecutado),
    proyectado: suma((s) => s.proyectado),
    saldo: 0,
  };
  total.saldo = redondear(total.meta - total.proyectado);
  return { id_centro_costo: idCentroCosto, subfases, total, lineas_sin_tipo_cambio: lineasSinTipoCambio };
}

/** Lee de la BD lo necesario y arma el gasto de la obra. Un solo recorrido por origen (metas, OC/OS, PECOSA). */
export async function cargarGastoObra(sql: AlmacenSql, idCentroCosto: number): Promise<GastoObra> {
  const q = sqlTag(sql);
  const num = { codecId: 'pg/int4@1', nullable: true } as const;
  const numNo = { codecId: 'pg/int4@1', nullable: false } as const;

  const metas = await q.rows<{ id: number; nombre: string | null; meta: string }>({ id: numNo, nombre: TN, meta: T })`
    SELECT s.id_ppto_detalle_categoria AS id, MAX(fc."Descripcion")::text AS nombre, SUM(COALESCE(s.monto, 0))::text AS meta
      FROM obra_subpartida s
      LEFT JOIN "ppto_DetalleFasesCate" sf ON sf.id = s.id_ppto_detalle_categoria
      LEFT JOIN "ppto_FasesCategorias" fc ON fc."IdpptoFaseCategoria" = sf."IdpptoFaseCategoria"
     WHERE s.id_centro_costo = ${idCentroCosto}::int AND s.id_ppto_detalle_categoria IS NOT NULL
     GROUP BY s.id_ppto_detalle_categoria
     ORDER BY s.id_ppto_detalle_categoria`;

  // La línea de una OC/OS hereda la subfase de su línea del FUR si no tiene una propia.
  const lineas = await q.rows<{
    subfase: number | null;
    tipo: string | null;
    monto: string;
    moneda_id: string | null;
    simbolo: string | null;
    fecha: string;
  }>({ subfase: num, tipo: TN, monto: T, moneda_id: TN, simbolo: TN, fecha: T })`
    SELECT COALESCE(od.id_ppto_detalle_categoria, rd.id_ppto_detalle_categoria) AS subfase,
           od."TipoProducto"::text AS tipo, COALESCE(od.monto, 0)::text AS monto,
           o.moneda_id::text AS moneda_id, o.moneda_simbolo::text AS simbolo,
           COALESCE(o.fecha_emision, o.fecha_creacion, now())::date::text AS fecha
      FROM "ordenCompraDetalle" od
      JOIN "documentosOrigen" o ON o.id = od.id_orden_compra
      LEFT JOIN requerimiento_detalle rd ON rd.id = od.id_requerimiento_detalle
     WHERE o.id_centro_costo = ${idCentroCosto}::int AND o.estado::text <> 'ANULADO'`;

  const salidas = await q.rows<{ subfase: number | null; costo: string }>({ subfase: num, costo: T })`
    SELECT l.id_ppto_detalle_categoria AS subfase, (l.cantidad * COALESCE(l.costo_unitario, 0))::text AS costo
      FROM almacen_documento_detalle l
      JOIN almacen_documento d ON d.id = l.id_documento
     WHERE d.id_centro_costo = ${idCentroCosto}::int AND d.naturaleza::text = 'SALIDA' AND d.motivo::text = 'CONSUMO'
       AND d.estado::text <> 'ANULADO'`;

  // Conversión a soles con el tipo de cambio de venta del día (o el último anterior), como el resto del sistema.
  const tcCache = new Map<string, number | null>();
  let sinTipoCambio = 0;
  const compras: LineaCompra[] = [];
  for (const l of lineas) {
    let monto = Number(l.monto);
    if (!esSoles(l.moneda_id, l.simbolo)) {
      const clave = claveMoneda(l.moneda_id, l.simbolo);
      const llave = `${clave}|${l.fecha}`;
      if (!tcCache.has(llave)) {
        const tc = await tcVigente(sql, clave, l.fecha);
        tcCache.set(llave, tc ? Number(tc.venta) : null);
      }
      const venta = tcCache.get(llave) ?? null;
      if (venta === null) {
        sinTipoCambio += 1;
        continue;
      }
      monto *= venta;
    }
    compras.push({ subfase: l.subfase, esServicio: (l.tipo ?? '').toUpperCase() === 'SERVICIO', monto });
  }

  const nombres = new Map<number, string>();
  const ids = [...new Set([...compras.map((c) => c.subfase), ...salidas.map((s) => s.subfase)].filter((i): i is number => i !== null))].filter(
    (i) => !metas.some((m) => m.id === i),
  );
  if (ids.length > 0) {
    const filas = await q.rows<{ id: number; nombre: string | null }>({ id: numNo, nombre: TN })`
      SELECT sf.id, fc."Descripcion"::text AS nombre
        FROM "ppto_DetalleFasesCate" sf
        LEFT JOIN "ppto_FasesCategorias" fc ON fc."IdpptoFaseCategoria" = sf."IdpptoFaseCategoria"
       WHERE sf.id = ANY(string_to_array(${ids.join(',')}::text, ',')::int[])`;
    for (const f of filas) if (f.nombre) nombres.set(f.id, f.nombre);
  }

  return calcularGastoSubfase(
    idCentroCosto,
    metas.map((m) => ({ id: m.id, nombre: m.nombre ?? `Subfase #${m.id}`, meta: Number(m.meta) })),
    compras,
    salidas.map((s) => ({ subfase: s.subfase, costo: Number(s.costo) })),
    nombres,
    sinTipoCambio,
  );
}
