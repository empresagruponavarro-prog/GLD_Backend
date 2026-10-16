import { Inject, Injectable } from '@nestjs/common';
import { leerModulosActivos } from '../../../../platform/auth/permisos-bd.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import { GrupoCatalogoDto } from './catalogo.dto.js';

@Injectable()
export class CatalogoPermisosHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Módulos activos agrupados; grupos y módulos en el orden de `modulo.orden`. */
  async catalogo(): Promise<GrupoCatalogoDto[]> {
    const grupos = new Map<string, GrupoCatalogoDto>();
    for (const m of await leerModulosActivos(this.db)) {
      let grupo = grupos.get(m.grupo);
      if (!grupo) {
        grupo = { grupo: m.grupo, modulos: [] };
        grupos.set(m.grupo, grupo);
      }
      grupo.modulos.push({
        id: m.id,
        clave: m.clave,
        nombre: m.nombre,
        ruta: m.ruta,
        orden: m.orden,
        admiteAprobar: m.admite_aprobar,
        admiteAnular: m.admite_anular,
      });
    }
    return [...grupos.values()];
  }
}
