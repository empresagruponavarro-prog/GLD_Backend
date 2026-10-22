import { Injectable } from '@nestjs/common';
import { PermisosRolService, type SujetoPermisos } from '../../../platform/auth/permisos-rol.js';
import { CLAVES_MODULO, SIN_PERMISOS, type ClaveModulo, type Permisos } from '../../../platform/auth/permisos.js';
import { MisPermisosDto } from './mis-permisos.dto.js';

@Injectable()
export class MisPermisosHandler {
  constructor(private readonly permisosRol: PermisosRolService) {}

  /**
   * Permisos efectivos de la sesión leídos de la BD, con LA MISMA función que usa `PermisosGuard`
   * (rol → filtro del área → excepciones del usuario): así el menú nunca muestra lo que la API niega.
   * Un módulo inactivo o ausente del catálogo no da ningún permiso.
   */
  async misPermisos(sujeto: SujetoPermisos): Promise<MisPermisosDto> {
    const { esAdministrador, modulos } = await this.permisosRol.obtenerParaUsuario(sujeto);
    const permisos = Object.fromEntries(
      CLAVES_MODULO.map((clave) => {
        const modulo = modulos.get(clave);
        return [clave, modulo?.activo ? modulo.permisos : SIN_PERMISOS] as const;
      }),
    );
    if (!tieneTodasLasClaves(permisos)) throw new Error('Permisos incompletos');
    return { rol: sujeto.rol, esAdministrador, permisos };
  }
}

/** Comprueba (y estrecha el tipo) que el registro trae todas las `CLAVES_MODULO`. */
function tieneTodasLasClaves(parcial: Partial<Record<ClaveModulo, Permisos>>): parcial is Record<ClaveModulo, Permisos> {
  return CLAVES_MODULO.every((clave) => parcial[clave] !== undefined);
}
