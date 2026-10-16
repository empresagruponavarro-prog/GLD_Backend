import type { Varchar } from '@prisma/orm-postgres/target/codec-types';

/**
 * Validación real de longitud que, además, estrecha `string` al tipo con marca `Varchar<N>`
 * que exige la ORM para filtrar o escribir columnas `varchar(N)` (sin `as`).
 */
export function esVarchar<N extends number>(valor: string, max: N): valor is Varchar<N> {
  return valor.length <= max;
}
