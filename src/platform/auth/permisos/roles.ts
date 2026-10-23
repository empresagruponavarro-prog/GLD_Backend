/**
 * Los roles viven en la tabla `rol` (administrables desde `/administration/roles`) y
 * `usuarios.Rol` guarda el NOMBRE del rol. Los permisos por modulo los aplica `PermisosGuard`.
 */

/** Nombre del rol del sistema sembrado (no se puede renombrar ni eliminar; `es_sistema`). */
export const ROL_ADMINISTRADOR = 'Administrador';
