/**
 * Modo de aplicación de los permisos en la API (D8), por la variable `PERMISOS_MODO`:
 * - `auditoria` (por defecto): la negativa se registra y la petición sigue.
 * - `estricto`: la negativa responde 403 `SIN_PERMISO`.
 * El grupo Administración se aplica siempre en estricto (`MODULOS_ADMINISTRACION`).
 */
export const MODOS_PERMISOS = ['auditoria', 'estricto'] as const;

export type ModoPermisos = (typeof MODOS_PERMISOS)[number];

export const MODO_PERMISOS_DEFECTO: ModoPermisos = 'auditoria';

export interface ModoPermisosLeido {
  modo: ModoPermisos;
  /** Valor recibido que no es un modo válido (se usa el de defecto); `null` si no hubo problema. */
  invalido: string | null;
}

function esModoPermisos(valor: string): valor is ModoPermisos {
  return MODOS_PERMISOS.some((m) => m === valor);
}

/** Lee `PERMISOS_MODO` (sin distinguir mayúsculas ni espacios). Falta o inválido → `auditoria`. */
export function leerModoPermisos(env: Readonly<Record<string, string | undefined>>): ModoPermisosLeido {
  const crudo = env['PERMISOS_MODO'];
  if (crudo === undefined || crudo.trim() === '') return { modo: MODO_PERMISOS_DEFECTO, invalido: null };
  const valor = crudo.trim().toLowerCase();
  return esModoPermisos(valor) ? { modo: valor, invalido: null } : { modo: MODO_PERMISOS_DEFECTO, invalido: crudo };
}
