import { ConflictException } from '@nestjs/common';
import type { Database } from '../../../prisma/prisma.module.js';
import { esVarchar } from '../../db/varchar.js';

/**
 * Trabajador (anexo) vinculado a un usuario (plan 09, D-9): firma como solicitante y aprobador de los FUR que el
 * presupuesto genera cuando ese usuario registra o adjudica una cotización. Se configura en Administración › Usuarios.
 */
export function exigirTrabajadorVinculado(idTrabajador: number | null | undefined, usuario: string): number {
  if (idTrabajador === null || idTrabajador === undefined) {
    throw new ConflictException(
      `El usuario ${usuario} no tiene un trabajador vinculado: pida al Administrador que lo asigne en Administración › Usuarios para poder adjudicar compras desde el presupuesto`,
    );
  }
  return idTrabajador;
}

/** Lee el trabajador vinculado del usuario con sesión; 409 si no tiene uno. */
export async function trabajadorDelUsuario(orm: Database['orm']['public'], idUsuario: string, usuario: string): Promise<number> {
  const fila = esVarchar(idUsuario, 255) ? await orm.Usuarios.first({ IdUsuario: idUsuario }) : null;
  return exigirTrabajadorVinculado(fila?.id_trabajador, usuario);
}
