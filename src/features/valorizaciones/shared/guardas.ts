import { ConflictException } from '@nestjs/common';
import { AlmacenSql, I, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { contratoDeDocumento, tieneMovimientoDePago } from './datos.js';

/**
 * Guardas que usan los demás módulos (documentos, almacén) para no desordenar un contrato de valorización (plan 12, D-15 y A-6/A-10).
 * Funciones libres que solo dependen de `AlmacenSql`.
 */

/** Cuántas cuotas aprobadas tiene la orden: las valorizaciones y la garantía devuelta, y aparte si hay adelanto aprobado. */
async function cuotasAprobadas(sql: AlmacenSql, idContrato: number, tx?: Tx): Promise<{ valorizaciones: number; adelanto: number }> {
  const q = sqlTag(sql);
  const [r] = await q.rows<{ v: number; a: number }>({ v: I, a: I }, tx)`
    SELECT (count(*) FILTER (WHERE tipo::text <> 'ADELANTO'))::int AS v, (count(*) FILTER (WHERE tipo::text = 'ADELANTO'))::int AS a
      FROM valorizacion WHERE id_contrato = ${idContrato}::int AND estado::text = 'APROBADA'`;
  return { valorizaciones: r?.v ?? 0, adelanto: r?.a ?? 0 };
}

/**
 * 409 si la orden tiene un contrato con cuotas aprobadas (más allá del adelanto): ya no admite cambiar líneas, montos o deducciones, ni anularse.
 * Con solo el adelanto aprobado se permite si nada se programó ni se pagó. `accion` redacta el mensaje («anular la orden»).
 */
export async function exigirSinValorizaciones(sql: AlmacenSql, tx: Tx, idDocumento: number, accion: string): Promise<void> {
  const c = await contratoDeDocumento(sql, idDocumento, tx);
  if (!c || c.estado === 'ANULADO') return;
  const aprobadas = await cuotasAprobadas(sql, c.id, tx);
  if (aprobadas.valorizaciones > 0) {
    throw new ConflictException(`No se puede ${accion}: la orden tiene valorizaciones aprobadas (contrato de valorización). Anule primero las valorizaciones`);
  }
  if (aprobadas.adelanto > 0 && (await tieneMovimientoDePago(sql, idDocumento, tx))) {
    throw new ConflictException(`No se puede ${accion}: el adelanto de la orden ya tiene pagos o programaciones`);
  }
}

/**
 * 409 si se intenta cambiar los montos de una orden cuyo contrato ya tiene vistos (VIGENTE o LIQUIDADO): sus cuotas se calculan sobre esos montos.
 * Con el contrato en borrador sí se puede (las cuotas aún no existen), pero los descuentos sueltos siguen prohibidos: se usan deductivos.
 */
export async function exigirMontosEditables(sql: AlmacenSql, tx: Tx, idDocumento: number, hayDescuentosSueltos: boolean): Promise<void> {
  const c = await contratoDeDocumento(sql, idDocumento, tx);
  if (!c || c.estado === 'ANULADO') return;
  if (c.estado !== 'BORRADOR') {
    throw new ConflictException('La orden tiene un contrato de valorización con vistos: sus montos ya no se cambian. Anule las valorizaciones o corrija con un deductivo');
  }
  if (hayDescuentosSueltos) throw new ConflictException('Con contrato de valorización los descuentos se registran como deductivos, no sueltos en la orden');
}

/** Al anular la orden: su contrato (si lo tiene) y su adelanto pasan a ANULADO. Se llama después de `exigirSinValorizaciones`. */
export async function anularContratoDeDocumento(sql: AlmacenSql, tx: Tx, idDocumento: number): Promise<void> {
  const c = await contratoDeDocumento(sql, idDocumento, tx);
  if (!c || c.estado === 'ANULADO') return;
  const q = sqlTag(sql);
  await q.run(tx)`UPDATE valorizacion SET estado = 'ANULADA', vigente = NULL, motivo_anulacion = 'Se anuló la orden de servicio' WHERE id_contrato = ${c.id}::int AND estado::text <> 'ANULADA'`;
  await q.run(tx)`UPDATE contrato_valorizacion SET estado = 'ANULADO', updated_at = now() WHERE id = ${c.id}::int`;
}

/** Al anular un documento de almacén (PECOSA): 409 si alguna de sus líneas ya se cobró al contratista con un deductivo vigente. */
export async function exigirSalidaSinDeductivos(sql: AlmacenSql, tx: Tx, idDocumentoAlmacen: number): Promise<void> {
  const q = sqlTag(sql);
  const [r] = await q.rows<{ n: number }>({ n: I }, tx)`
    SELECT count(*)::int AS n FROM deductivo_proveedor d JOIN almacen_documento_detalle l ON l.id = d.id_almacen_detalle
     WHERE l.id_documento = ${idDocumentoAlmacen}::int AND d.estado::text <> 'ANULADO'`;
  if ((r?.n ?? 0) > 0) {
    throw new ConflictException('No se puede anular: una línea de este documento ya se cobró a un contratista como deductivo. Anule primero el deductivo');
  }
}
