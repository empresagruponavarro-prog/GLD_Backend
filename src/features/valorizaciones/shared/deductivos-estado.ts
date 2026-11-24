import { AlmacenSql, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { csv } from '../../almacen/shared/oc-saldos.js';

/** Estado de los deductivos tras aplicarlos o liberarlos en una cuota (plan 12, D-12). */

/** Un deductivo cuyo monto ya se descontó por completo en cuotas aprobadas pasa a `APLICADO`. */
export async function marcarAplicados(sql: AlmacenSql, tx: Tx, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return;
  const q = sqlTag(sql);
  await q.run(tx)`
    UPDATE deductivo_proveedor d SET estado = 'APLICADO'
     WHERE d.id = ANY(string_to_array(${csv([...ids])}::text, ',')::int[]) AND d.estado::text = 'PENDIENTE'
       AND d.monto - COALESCE((SELECT SUM(a.monto) FROM valorizacion_deductivo a JOIN valorizacion v ON v.id = a.id_valorizacion
                                WHERE a.id_deductivo = d.id AND v.estado::text = 'APROBADA'), 0) <= 0.005`;
}

/** Al anular una cuota se sueltan sus deductivos: lo que se había descontado vuelve a estar pendiente. */
export async function liberarDeductivosDeCuota(sql: AlmacenSql, tx: Tx, idCuota: number): Promise<void> {
  const q = sqlTag(sql);
  await q.run(tx)`
    UPDATE deductivo_proveedor SET estado = 'PENDIENTE'
     WHERE estado::text = 'APLICADO' AND id IN (SELECT id_deductivo FROM valorizacion_deductivo WHERE id_valorizacion = ${idCuota}::int)`;
  await q.run(tx)`DELETE FROM valorizacion_deductivo WHERE id_valorizacion = ${idCuota}::int`;
}
