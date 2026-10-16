import { Inject, Injectable } from '@nestjs/common';
import { DB, type Database } from '../../prisma/prisma.module.js';
import { esVarchar } from '../db/varchar.js';

/** Estado vigente en la BD del usuario de una sesión. */
export interface UsuarioSesionBd {
  activo: boolean;
  /** `usuarios.Rol` sin espacios extremos ('' si no tiene). */
  rol: string;
}

/** Vigencia de la caché por usuario (`sub` del JWT). */
export const SESION_CACHE_MS = 10_000;
/** Tope de entradas: al llenarse se vacía (solo hay tantos usuarios como filas en `usuarios`). */
const SESION_CACHE_MAX = 5_000;

/**
 * Lee de la BD si el usuario de un JWT existe, está activo y qué rol tiene, con caché en memoria
 * por `sub` de ~10 s. Quien cambia el estado, el rol o borra un usuario debe llamar a
 * `invalidar(id)` (o `invalidarTodo()` al renombrar un rol) para que el cambio se aplique ya.
 */
@Injectable()
export class SesionUsuariosService {
  private readonly cache = new Map<string, { valor: UsuarioSesionBd | null; expira: number }>();
  /** Cambia en cada invalidación: una lectura iniciada antes no se guarda en la caché. */
  private generacion = 0;

  constructor(@Inject(DB) private readonly db: Pick<Database, 'orm'>) {}

  async obtener(id: string): Promise<UsuarioSesionBd | null> {
    const hit = this.cache.get(id);
    if (hit && hit.expira > Date.now()) return hit.valor;

    const generacion = this.generacion;
    const valor = await this.leer(id);
    if (generacion === this.generacion) {
      if (this.cache.size >= SESION_CACHE_MAX) this.cache.clear();
      this.cache.set(id, { valor, expira: Date.now() + SESION_CACHE_MS });
    }
    return valor;
  }

  invalidar(id: string): void {
    this.generacion++;
    this.cache.delete(id);
  }

  invalidarTodo(): void {
    this.generacion++;
    this.cache.clear();
  }

  private async leer(id: string): Promise<UsuarioSesionBd | null> {
    if (!esVarchar(id, 255)) return null;
    const row = await this.db.orm.public.Usuarios.first({ IdUsuario: id });
    if (!row) return null;
    return { activo: row.activo, rol: (row.Rol ?? '').trim() };
  }
}
