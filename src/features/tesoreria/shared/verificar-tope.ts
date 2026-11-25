import { BadRequestException, ConflictException } from '@nestjs/common';
import { I, T, sqlTag, type AlmacenSql } from '../../almacen/shared/almacen-sql.js';
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
  /** Cuota de un contrato de valorización a la que se liga el pago (plan 12). */
  idValorizacion?: number;
}

const EPS = 0.005;

/**
 * Orden de servicio con contrato de valorización (plan 12): solo se programa y paga lo que las valorizaciones aprobadas ya liberaron
 * (`exigible`), y con los dos vistos. No admite «por encima del avance»: lo aprobado manda. Si el pago se liga a una cuota, tampoco puede
 * pasar del neto de esa cuota. 409 `CONTRATO_SIN_VISTOS` / `NO_LIBERADO`.
 */
async function verificarContrato(sql: AlmacenSql, doc: DocumentoConsultado, p: PagoAVerificar): Promise<false> {
  if (p.exceder) throw new BadRequestException('Una orden con contrato de valorización no se paga por encima de lo aprobado: apruebe la valorización');
  if (doc.estado_contrato === 'BORRADOR') {
    throw new ConflictException({
      codigo: 'CONTRATO_SIN_VISTOS',
      message: `El contrato de ${doc.numero_documento ?? doc.id} todavía no tiene los dos vistos (Operaciones y Administración): no se puede programar ni pagar`,
    });
  }
  const detraccion = p.concepto === 'DETRACCION';
  const exigible = Number(detraccion ? doc.exigible_detraccion : doc.exigible);
  const pagado = Number(detraccion ? doc.pagado_detraccion : doc.pagado_proveedor);
  const programado = Number(detraccion ? doc.programado_detraccion : doc.programado_proveedor) - (p.devolver ?? 0);
  const libre = Math.max(exigible - pagado - programado, 0);
  if (p.monto > libre + EPS) {
    throw new ConflictException({
      codigo: 'NO_LIBERADO',
      message: `El pago de ${doc.numero_documento ?? doc.id} supera lo que liberan las valorizaciones aprobadas: aprobado ${exigible.toFixed(2)}, ya pagado o programado ${(pagado + programado).toFixed(2)}, disponible ${libre.toFixed(2)}`,
    });
  }
  if (p.idValorizacion !== undefined && !detraccion) {
    const q = sqlTag(sql);
    const [c] = await q.rows<{ neto: string; numero: number; tipo: string; comprometido: string }>({ neto: T, numero: I, tipo: T, comprometido: T })`
      SELECT v.neto::text AS neto, v.numero, v.tipo::text AS tipo,
             COALESCE((SELECT sum(g.monto) FROM pago_programado g WHERE g.id_valorizacion = v.id AND g.estado::text IN ('PROGRAMADO', 'EJECUTADO')), 0)::text AS comprometido
        FROM valorizacion v
       WHERE v.id = ${p.idValorizacion}::int AND v.id_contrato = ${doc.id_contrato ?? 0}::int AND v.estado::text = 'APROBADA'`;
    if (!c) throw new ConflictException({ codigo: 'NO_LIBERADO', message: `La valorización ${p.idValorizacion} no está aprobada o no es de este contrato` });
    const libreCuota = Number(c.neto) - Number(c.comprometido);
    if (p.monto > libreCuota + EPS) {
      throw new ConflictException({
        codigo: 'NO_LIBERADO',
        message: `La ${c.tipo === 'ADELANTO' ? 'cuota de adelanto' : c.tipo === 'GARANTIA' ? 'devolución de garantía' : `valorización ${c.numero}`} solo tiene ${Math.max(libreCuota, 0).toFixed(2)} por programar`,
      });
    }
  }
  return false;
}

/**
 * Orden de servicio de un presupuesto (plan 09, D-13): lo pagado más lo programado no puede pasar de `neto × max(adelanto %, avance %)`.
 * Devuelve `true` si el pago excede el tope y se permitió (con `exceder` y el motivo); 409 si excede sin permiso. La detracción y los
 * documentos sin tope no se limitan. La usan **todas** las rutas que comprometen un pago: programar, reprogramar y pagar directo.
 */
export async function verificarTope(sql: AlmacenSql, orm: OrmObra, doc: DocumentoConsultado, p: PagoAVerificar): Promise<boolean> {
  if (p.idValorizacion !== undefined && !doc.tiene_contrato) throw new BadRequestException(`El documento ${doc.numero_documento ?? doc.id} no tiene contrato de valorización`);
  if (doc.tiene_contrato) return verificarContrato(sql, doc, p);
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
