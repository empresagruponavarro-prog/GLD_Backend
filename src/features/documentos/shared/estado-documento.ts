import { ConflictException } from '@nestjs/common';

/**
 * Estados de un documento de origen (`documentosOrigen.estado`).
 *  - `PROVISIONAL` (plan 09): lo genera la conciliación de un presupuesto Meta que todavía no está aprobado. Se ve y se imprime,
 *    pero no se programa, no se paga ni se recibe en almacén; lo gestiona el presupuesto, no el usuario a mano.
 *  - `REGISTRADO`: compromiso vigente.
 *  - `ANULADO`.
 */
export type EstadoDocumentoOrigen = 'PROVISIONAL' | 'REGISTRADO' | 'ANULADO';

/** Datos de cabecera que se completan a mano en un documento provisional (el resto lo define la cotización ganadora). */
export const CAMPOS_EDITABLES_PROVISIONAL: readonly string[] = ['fecha_emision', 'comentarios', 'oc_pdf'];

const ORIGEN = 'el documento es provisional y lo gestiona el presupuesto que lo generó (se habilita al aprobarlo)';

/** 409 si el documento es provisional: no admite la acción (programar, pagar, recibir, anular, eliminar…). */
export function exigirNoProvisional(estado: string | null | undefined, accion: string): void {
  if (estado === 'PROVISIONAL') throw new ConflictException(`No se puede ${accion}: ${ORIGEN}`);
}

/** Campos enviados que un documento provisional no admite editar a mano. */
export function camposNoEditablesEnProvisional(dto: object): string[] {
  return Object.entries(dto)
    .filter(([campo, valor]) => valor !== undefined && !CAMPOS_EDITABLES_PROVISIONAL.includes(campo))
    .map(([campo]) => campo);
}

/** 409 si, siendo provisional, el cambio toca algo más que fecha, comentarios o PDF. */
export function exigirCamposDeCabecera(estado: string | null | undefined, dto: object): void {
  if (estado !== 'PROVISIONAL') return;
  const no = camposNoEditablesEnProvisional(dto);
  if (no.length > 0) {
    throw new ConflictException(
      `El documento es provisional: solo se puede completar ${CAMPOS_EDITABLES_PROVISIONAL.join(', ')}. No se puede cambiar ${no.join(', ')}: lo define el presupuesto`,
    );
  }
}
