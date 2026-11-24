import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AlmacenSql } from '../../almacen/shared/almacen-sql.js';
import type { OrmObra } from '../../operaciones-obra/shared/control-avance/orm.js';
import type { DocumentoConsultado } from './documentos-consulta.js';
import { cargarTopesAvance } from './tope-avance-carga.js';
import { superaTope } from './tope-avance.js';

const MARCA_EXCESO = '[POR ENCIMA DEL AVANCE]';

/** Deja constancia en las observaciones de que el pago se hizo por encima del avance (una sola vez). */
export function marcarExceso(motivo: string | undefined): string {
  const t = (motivo ?? '').trim();
  return t.startsWith(MARCA_EXCESO) ? t : `${MARCA_EXCESO} ${t}`;
}

export interface PagoAVerificar {
  concepto: string;
  monto: number;
  /** Quien paga pidió pasar el tope: exige `motivo`. */
  exceder: boolean;
  motivo: string | undefined;
  /** Monto de la programación que se está cambiando (no cuenta dos veces). */
  devolver?: number;
}

/**
 * Orden de servicio de un presupuesto (plan 09, D-13): lo pagado más lo programado no puede pasar de `neto × max(adelanto %, avance %)`.
 * Devuelve `true` si el pago excede el tope y se permitió (con `exceder` y el motivo); 409 si excede sin permiso. La detracción y los
 * documentos sin tope no se limitan. La usan **todas** las rutas que comprometen un pago: programar, reprogramar y pagar directo.
 */
export async function verificarTope(sql: AlmacenSql, orm: OrmObra, doc: DocumentoConsultado, p: PagoAVerificar): Promise<boolean> {
  if (p.concepto !== 'PROVEEDOR') return false;
  const info = (await cargarTopesAvance(sql, orm, [doc])).get(doc.id);
  if (!info) return false;
  const devolver = p.devolver ?? 0;
  if (!superaTope(info.tope, info.pagado, info.programado - devolver, p.monto)) return false;
  const libre = Math.max(info.tope - info.pagado - (info.programado - devolver), 0);
  if (!p.exceder) {
    throw new ConflictException(
      `El pago de ${doc.numero_documento ?? doc.id} supera lo que libera el avance de obra: tope ${info.tope.toFixed(2)} (adelanto ${info.adelanto_porcentaje} %, avance ${info.avance_pct} %), ya pagado o programado ${(info.pagado + info.programado - devolver).toFixed(2)}, disponible ${libre.toFixed(2)}. ` +
        'Registre el avance en Operaciones o programe por encima del avance con «exceder_avance» y el motivo en observaciones',
    );
  }
  if (!p.motivo || p.motivo.trim() === '') throw new BadRequestException('Un pago por encima del avance de obra necesita el motivo en observaciones');
  return true;
}
