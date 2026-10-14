import { SetMetadata } from '@nestjs/common';
import type { Rol } from './roles.js';

export const ROLES_KEY = 'auth:roles';

/** Restringe una ruta (o controller) a los roles indicados. Lo evalua `RolesGuard`. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
