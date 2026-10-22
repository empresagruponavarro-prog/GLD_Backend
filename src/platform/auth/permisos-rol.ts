import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../../prisma/prisma.module.js';
import {
  buscarRolPorNombre,
  leerFilasPermiso,
  leerFilasPermisoUsuario,
  leerModulosDeArea,
  leerTodosLosModulos,
} from './permisos-bd.js';
import {
  SIN_PERMISOS,
  detallePermisosModulo,
  permisosEfectivos,
  type Accion,
  type ModulosDeArea,
  type Permisos,
} from './permisos.js';

/** Permisos efectivos de un rol (o de una persona) en un módulo del catálogo. */
export interface ModuloConPermisos {
  nombre: string;
  activo: boolean;
  permisos: Permisos;
}

/** Lo que `PermisosGuard` necesita saber de la sesión. */
export interface PermisosDeRol {
  /** Rol de sistema (`rol.es_sistema`): todo permitido. */
  esAdministrador: boolean;
  /** Por `modulo.clave`; un módulo ausente del catálogo no está en el mapa. */
  modulos: ReadonlyMap<string, ModuloConPermisos>;
}

/** Persona a la que se le calculan los permisos: lo que `JwtAuthGuard` deja en `req.user`. */
export interface SujetoPermisos {
  readonly id: string;
  readonly rol: string;
  readonly id_area?: number | null | undefined;
}

/** Vigencia de las cachés (rol, área, excepciones del usuario y catálogo de módulos). */
export const PERMISOS_ROL_CACHE_MS = 30_000;
/** Tope de entradas de cada caché: al llenarse se vacía. */
const PERMISOS_ROL_CACHE_MAX = 500;

type Filas = ReadonlyMap<number, Readonly<Record<Accion, boolean>>>;
type CatalogoModulos = Awaited<ReturnType<typeof leerTodosLosModulos>>;

/**
 * Caché en memoria con vigencia. Una lectura iniciada antes de `invalidar`/`vaciar` no se guarda
 * (evita que un valor viejo vuelva a la caché tras un cambio).
 */
class CacheVigente<V> {
  private readonly entradas = new Map<string, { valor: V; expira: number }>();
  /** Cambia en cada invalidación. */
  private generacion = 0;

  async obtener(clave: string, leer: () => Promise<V>): Promise<V> {
    const hit = this.entradas.get(clave);
    if (hit && hit.expira > Date.now()) return hit.valor;
    const generacion = this.generacion;
    const valor = await leer();
    if (generacion === this.generacion) {
      if (this.entradas.size >= PERMISOS_ROL_CACHE_MAX) this.entradas.clear();
      this.entradas.set(clave, { valor, expira: Date.now() + PERMISOS_ROL_CACHE_MS });
    }
    return valor;
  }

  invalidar(clave: string): void {
    this.generacion++;
    this.entradas.delete(clave);
  }

  vaciar(): void {
    this.generacion++;
    this.entradas.clear();
  }
}

/**
 * Permisos leídos de la BD con caché de 30 s.
 *
 * - **Por rol** (por NOMBRE, como lo guarda `usuarios.Rol`): `obtener`. Se invalida al guardar la
 *   matriz del rol (`invalidarRol`) y al renombrar o borrar un rol (`invalidarTodo` / `invalidarRol`).
 * - **Por persona** (`obtenerParaUsuario`, plan 08): rol → filtro del área → excepciones del usuario.
 *   Se cachean por separado el rol, los módulos del área y las excepciones del usuario, y se combinan
 *   en memoria en cada petición; así un cambio en un rol o en un área se refleja sin invalidar
 *   usuario por usuario. El cambio de rol o de área de un usuario lo cubre
 *   `SesionUsuariosService.invalidar(id)` (el rol y el área vigentes se releen de la BD).
 */
@Injectable()
export class PermisosRolService {
  private readonly roles = new CacheVigente<PermisosDeRol>();
  private readonly areas = new CacheVigente<ModulosDeArea | null>();
  private readonly excepciones = new CacheVigente<Filas>();
  private readonly catalogo = new CacheVigente<CatalogoModulos>();

  constructor(@Inject(DB) private readonly db: Pick<Database, 'orm'>) {}

  /** Permisos que da el ROL (sin área ni excepciones). */
  obtener(rol: string): Promise<PermisosDeRol> {
    const nombre = rol.trim();
    return this.roles.obtener(nombre, () => this.leer(nombre));
  }

  /**
   * Permisos efectivos de una persona: 1) los de su rol; 2) si tiene un área con módulos configurados,
   * el área deja cada módulo en no / solo ver / completo (Administración y `modulos` no se filtran);
   * 3) cada excepción del usuario reemplaza solo su módulo. El Administrador no pasa por 2 ni 3.
   */
  async obtenerParaUsuario(sujeto: SujetoPermisos): Promise<PermisosDeRol> {
    const base = await this.obtener(sujeto.rol);
    if (base.esAdministrador) return base;

    const idArea = sujeto.id_area ?? null;
    const [area, excepciones] = await Promise.all([
      idArea === null
        ? Promise.resolve(null)
        : this.areas.obtener(String(idArea), () => leerModulosDeArea(this.db, idArea)),
      this.excepciones.obtener(sujeto.id.trim(), () => leerFilasPermisoUsuario(this.db, sujeto.id)),
    ]);
    if (area === null && excepciones.size === 0) return base;

    const modulosCatalogo = await this.catalogo.obtener('modulos', () => leerTodosLosModulos(this.db));
    const modulos = new Map<string, ModuloConPermisos>();
    for (const modulo of modulosCatalogo) {
      const delRol = base.modulos.get(modulo.clave);
      if (!delRol) continue;
      const detalle = detallePermisosModulo({
        modulo,
        rol: delRol.permisos,
        area,
        excepcion: excepciones.get(modulo.id),
      });
      modulos.set(modulo.clave, { nombre: delRol.nombre, activo: delRol.activo, permisos: detalle.efectivo });
    }
    return { esAdministrador: false, modulos };
  }

  invalidarRol(rol: string): void {
    this.roles.invalidar(rol.trim());
  }

  /** Tras guardar o restablecer las excepciones de un usuario. */
  invalidarUsuario(usuarioId: string): void {
    this.excepciones.invalidar(usuarioId.trim());
  }

  /** Tras guardar los módulos de un área. */
  invalidarArea(idArea: number): void {
    this.areas.invalidar(String(idArea));
  }

  invalidarTodo(): void {
    this.roles.vaciar();
    this.areas.vaciar();
    this.excepciones.vaciar();
    this.catalogo.vaciar();
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
