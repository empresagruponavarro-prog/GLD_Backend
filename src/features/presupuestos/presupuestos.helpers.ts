/**
 * @deprecated Los helpers viven ahora en `src/platform/db/varchar-helpers.ts`.
 * Se deja este re-export solo porque `documentos/documentos-origen` (carpeta de otra persona)
 * aún lo importa; borrar este archivo cuando ese import se actualice.
 */
export { toVarchar, toDecimalString, type Varchar255, type Varchar50 } from '../../platform/db/varchar-helpers.js';
