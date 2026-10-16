import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../../prisma/prisma.module.js';
import { buscarRolPorNombre, leerFilasPermiso, leerTodosLosModulos } from './permisos-bd.js';
import { SIN_PERMISOS, permisosEfectivos, type Accion, type Permisos } from './permisos.js';

/** Permisos efectivos de un rol en un módulo del catálogo. */
export interface ModuloConPermisos {
  nombre: string;
  activo: boolean;
  permisos: Permisos;
}

/** Lo que `PermisosGuard` necesita saber del rol de la sesión. */
export interface PermisosDeRol {
  /** Rol de sistema (`rol.es_sistema`): todo permitido. */
  esAdministrador: boolean;
  /** Por `modulo.clave`; un módulo ausente del catálogo no está en el mapa. */
  modulos: ReadonlyMap<string, ModuloConPermisos>;
}

/** Vigencia de la caché por rol. */
export const PERMISOS_ROL_CACHE_MS = 30_000;
/** Tope de entradas: al llenarse se vacía (hay tantos roles como filas en `rol`). */
const PERMISOS_ROL_CACHE_MAX = 500;

/**
 * Permisos por rol (por NOMBRE, como lo guarda `usuarios.Rol`) leídos de la BD, con caché en
 * memoria de 30 s. Se invalida al guardar la matriz de un rol (`invalidarRol`) y al renombrar o
 * borrar un rol (`invalidarTodo` / `invalidarRol`). El cambio de rol de un usuario lo cubre
 * `SesionUsuariosService.invalidar(id)`: el rol vigente del usuario se relee de la BD y la caché
 * de aquí es por rol, no por usuario.
 */
@Injectable()
export class PermisosRolService {
  private readonly cache = new Map<string, { valor: PermisosDeRol; expira: number }>();
  /** Cambia en cada invalidación: una lectura iniciada antes no se guarda en la caché. */
  private generacion = 0;

  constructor(@Inject(DB) private readonly db: Pick<Database, 'orm'>) {}

  async obtener(rol: string): Promise<PermisosDeRol> {
    const clave = rol.trim();
    const hit = this.cache.get(clave);
    if (hit && hit.expira > Date.now()) return hit.valor;

    const generacion = this.generacion;
    const valor = await this.leer(clave);
    if (generacion === this.generacion) {
      if (this.cache.size >= PERMISOS_ROL_CACHE_MAX) this.cache.clear();
      this.cache.set(clave, { valor, expira: Date.now() + PERMISOS_ROL_CACHE_MS });
    }
    return valor;
  }

  invalidarRol(rol: string): void {
    this.generacion++;
    this.cache.delete(rol.trim());
  }

  invalidarTodo(): void {
    this.generacion++;
    this.cache.clear();
  }

  private async leer(nombre: string): Promise<PermisosDeRol> {
    const rol = await buscarRolPorNombre(this.db, nombre);
    const esAdministrador = rol?.es_sistema ?? false;
    const [modulos, guardadas] = await Promise.all([
      leerTodosLosModulos(this.db),
      rol && !rol.es_sistema
        ? leerFilasPermiso(this.db, rol.id)
        : Promise.resolve(new Map<number, Readonly<Record<Accion, boolean>>>()),
    ]);
    const porClave = new Map<string, ModuloConPermisos>();
    for (const m of modulos) {
      porClave.set(m.clave, {
        nombre: m.nombre,
        activo: m.activo,
        permisos: rol ? permisosEfectivos(m, esAdministrador, guardadas.get(m.id)) : SIN_PERMISOS,
      });
    }
    return { esAdministrador, modulos: porClave };
  }
}
