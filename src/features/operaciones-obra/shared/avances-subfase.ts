import { AlmacenSql, I, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { realHastaSemana } from './control-avance/avance.js';
import { aDia, lunesDe, semanaDeFecha } from './control-avance/calendario.js';
import { cargarObra } from './control-avance/carga-obra.js';
import type { ObraEntrada } from './control-avance/control-avance.types.js';
import { calcularObra } from './control-avance/motor.js';
import type { OrmObra } from './control-avance/orm.js';
import { hoyLima } from './obra-shared.js';

/**
 * Avance real (0-100) de cada subpartida de la obra **al corte** (`YYYY-MM-DD`): lo registrado hasta la semana que contiene esa fecha.
 * Puro. Es lo que sirve para valorizar una semana pasada sin que el avance posterior la cambie.
 */
export function avanceAlCorte(entrada: ObraEntrada, corte: string): Map<string, number> {
  const semana = semanaDeFecha(lunesDe(aDia(entrada.inicio)), aDia(corte));
  const porItem = new Map<string, number>();
  for (const p of entrada.partidas) for (const s of p.subpartidas) porItem.set(s.item, realHastaSemana(s.avance, semana));
  return porItem;
}

/**
 * Avance real por subfase (`ppto_DetalleFasesCate.id`) de la obra de un centro de costo; vacío si la obra no está en el control de avance.
 * Sin `corte` es el avance de hoy (lo mismo que calcula el motor); con `corte`, el acumulado hasta esa fecha.
 */
export async function avancesPorSubfase(orm: OrmObra, idCentroCosto: number, corte?: string): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  const carga = await cargarObra(orm, idCentroCosto).catch(() => null);
  if (!carga?.entrada) return mapa;
  const realPorItem =
    corte === undefined
      ? new Map(calcularObra(carga.entrada, hoyLima()).partidas.flatMap((p) => p.subpartidas.map((s) => [s.item, s.real] as const)))
      : avanceAlCorte(carga.entrada, corte);
  for (const s of carga.filas.subs) {
    if (s.id_ppto_detalle_categoria != null) mapa.set(s.id_ppto_detalle_categoria, realPorItem.get(s.item) ?? 0);
  }
  return mapa;
}

/**
 * Subfases equivalentes de cada línea de una orden: la que imputó la línea y las de los ítems que **descienden** del suyo en las versiones
 * siguientes del presupuesto (`id_item_origen`, la cadena inversa de `cobertura-origen.ts`). Una versión nueva reemplaza la estructura de la
 * obra con subfases nuevas: sin esto, la orden de la versión anterior nunca vería el avance que se registra en la vigente.
 * La subfase propia va primero. Devuelve `id de la línea (ordenCompraDetalle) → subfases`.
 */
export async function subfasesDeLineas(sql: AlmacenSql, idsLinea: readonly number[], tx?: Tx): Promise<Map<number, number[]>> {
  const resultado = new Map<number, number[]>();
  if (idsLinea.length === 0) return resultado;
  const q = sqlTag(sql);
  const filas = await q.rows<{ id_linea: number; subfase: number }>({ id_linea: I, subfase: I }, tx)`
    WITH RECURSIVE cadena(id_linea, item, nivel) AS (
      SELECT od.id, rd.id_ppto_item, 0
        FROM "ordenCompraDetalle" od
        JOIN requerimiento_detalle rd ON rd.id = od.id_requerimiento_detalle
       WHERE od.id = ANY(string_to_array(${csv([...idsLinea])}::text, ',')::int[]) AND rd.id_ppto_item IS NOT NULL
      UNION
      SELECT c.id_linea, i.id, c.nivel + 1
        FROM cadena c JOIN "ppto_DetalleItems" i ON i.id_item_origen = c.item
    )
    SELECT c.id_linea, i.id_detalle_categoria AS subfase
      FROM cadena c JOIN "ppto_DetalleItems" i ON i.id = c.item
     ORDER BY c.id_linea, c.nivel, i.id`;
  for (const f of filas) {
    const lista = resultado.get(f.id_linea) ?? [];
    if (!lista.includes(f.subfase)) lista.push(f.subfase);
    resultado.set(f.id_linea, lista);
  }
  return resultado;
}

/** Avance de una línea: el de su subfase o, si la obra ya no la tiene, el de la primera subfase equivalente que sí tenga. `null` = sin dato. */
export function avanceDeLinea(idSubfase: number | null, equivalentes: readonly number[], avances: ReadonlyMap<number, number>): number | null {
  const candidatas = idSubfase === null ? equivalentes : [idSubfase, ...equivalentes];
  for (const c of candidatas) {
    const a = avances.get(c);
    if (a !== undefined) return a;
  }
  return null;
}
