import { BadRequestException } from '@nestjs/common';
import { AlmacenSql, B, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';

export interface RequerimientoBloqueado {
  id: number;
  estado: string;
  id_centro_costo: number;
  id_fase: number | null;
}

/** Lee el FUR y lo bloquea (`FOR UPDATE`) hasta el fin de la transaccion. */
export async function bloquearRequerimiento(sql: AlmacenSql, tx: Tx, id: number): Promise<RequerimientoBloqueado | null> {
  const q = sqlTag(sql);
  const [row] = await q.rows<RequerimientoBloqueado>({ id: I, estado: T, id_centro_costo: I, id_fase: IN }, tx)`
    SELECT id, estado::text AS estado, id_centro_costo, id_fase
      FROM requerimiento WHERE id = ${id}::int FOR UPDATE`;
  return row ?? null;
}

/** Inserta una fila de historial del FUR. */
export async function registrarEvento(
  sql: AlmacenSql,
  tx: Tx,
  idRequerimiento: number,
  accion: string,
  estadoAnterior: string | null,
  estadoNuevo: string,
  idAnexo: number | null,
  comentario: string | null,
): Promise<void> {
  const q = sqlTag(sql);
  await q.run(tx)`
    INSERT INTO requerimiento_evento (id_requerimiento, accion, estado_anterior, estado_nuevo, id_anexo, comentario)
    VALUES (${idRequerimiento}::int, ${accion}::text, NULLIF(${estadoAnterior ?? ''}::text, ''), ${estadoNuevo}::text,
            NULLIF(${idAnexo ?? 0}::int, 0), NULLIF(${comentario ?? ''}::text, ''))`;
}

/** Verifica que el anexo exista y sea de tipo Trabajador; devuelve su nombre. */
export async function validarTrabajador(sql: AlmacenSql, tx: Tx, idAnexo: number, campo: string): Promise<string> {
  const q = sqlTag(sql);
  const [row] = await q.rows<{ nombre: string | null; ok: boolean }>({ nombre: TN, ok: B }, tx)`
    SELECT COALESCE("NombreComercial", "Anexo")::text AS nombre, ("tipoAnexo" = 'Trabajador') AS ok
      FROM anexos WHERE id = ${idAnexo}::int`;
  if (!row || !row.ok) {
    throw new BadRequestException(`${campo} (${idAnexo}) no es un Anexo de tipo Trabajador`);
  }
  return row.nombre ?? '';
}
