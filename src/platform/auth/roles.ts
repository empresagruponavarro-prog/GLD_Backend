/**
 * Los roles viven en la tabla `rol` (administrables desde
 * `/administration/roles`). `usuarios.Rol` guarda el NOMBRE del rol y
 * `@Roles(...)` / `RolesGuard` comparan por nombre exacto.
 */

/** Rol del sistema (no se puede renombrar ni eliminar). */
export const ROL_ADMINISTRADOR = 'Administrador';

/** Nombre de un rol tal como se guarda en `rol.nombre` / `usuarios.Rol`. */
export type Rol = string;
