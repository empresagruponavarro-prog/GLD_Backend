/**
 * Código de usuario correlativo (USR-0001, USR-0002…). Lo usan el alta de usuarios y el
 * comando `usuarios:crear-admin`, así que no depende de Nest.
 */
const PREFIJO_ID = 'USR-';
const PATRON_ID = /^USR-(\d+)$/;

/** Siguiente código correlativo, ignorando los ids con otro formato. */
export function siguienteIdUsuario(ids: readonly string[]): string {
  const mayor = ids.reduce((max, id) => {
    const m = PATRON_ID.exec(id.trim());
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `${PREFIJO_ID}${String(mayor + 1).padStart(4, '0')}`;
}
