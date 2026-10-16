import { Inject, Injectable } from '@nestjs/common';
import {
  buscarRolPorNombre,
  leerFilasPermiso,
  leerModulosActivos,
} from '../../../platform/auth/permisos-bd.js';
import {
  CLAVES_MODULO,
  SIN_PERMISOS,
  permisosEfectivos,
  type Accion,
  type ClaveModulo,
  type Permisos,
} from '../../../platform/auth/permisos.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { MisPermisosDto } from './mis-permisos.dto.js';

@Injectable()
export class MisPermisosHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Permisos del rol de la sesión leídos de la BD. `rol` es el que `JwtAuthGuard` ya tomó de la
   * BD. Todas las claves de `CLAVES_MODULO` están presentes: un módulo inactivo o ausente del
   * catálogo, o un usuario sin rol, quedan en `false`.
   */
  async misPermisos(rolNombre: string): Promise<MisPermisosDto> {
    const rol = await buscarRolPorNombre(this.db, rolNombre);
    const esAdministrador = rol?.es_sistema ?? false;
    const [modulos, guardadas] = await Promise.all([
      leerModulosActivos(this.db),
      rol && !rol.es_sistema
        ? leerFilasPermiso(this.db, rol.id)
        : Promise.resolve(new Map<number, Readonly<Record<Accion, boolean>>>()),
    ]);
    const porClave = new Map(modulos.map((m) => [m.clave, m]));

    const permisos: Partial<Record<ClaveModulo, Permisos>> = {};
    for (const clave of CLAVES_MODULO) {
      const modulo = porClave.get(clave);
      permisos[clave] =
        rol && modulo ? permisosEfectivos(modulo, esAdministrador, guardadas.get(modulo.id)) : SIN_PERMISOS;
    }
    if (!tieneTodasLasClaves(permisos)) throw new Error('Permisos incompletos');
    return { rol: rolNombre, esAdministrador, permisos };
  }
}

/** Comprueba (y estrecha el tipo) que el registro trae todas las `CLAVES_MODULO`. */
function tieneTodasLasClaves(
  parcial: Partial<Record<ClaveModulo, Permisos>>,
): parcial is Record<ClaveModulo, Permisos> {
  return CLAVES_MODULO.every((clave) => parcial[clave] !== undefined);
}
