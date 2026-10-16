import type { Database } from '../../prisma/prisma.module.js';
import { esVarchar } from '../db/varchar.js';
import type { Accion } from './permisos.js';

type Db = Pick<Database, 'orm'>;

/** Fila de `modulo` tal como la usan el catálogo y las matrices. */
export interface ModuloFila {
  id: number;
  clave: string;
  nombre: string;
  grupo: string;
  ruta: string | null;
  orden: number;
  admite_aprobar: boolean;
  admite_anular: boolean;
}

export interface RolFila {
  id: number;
  nombre: string;
  es_sistema: boolean;
}

/** Módulos activos ordenados por `orden` (y por `id` a igualdad). */
export async function leerModulosActivos(db: Db): Promise<ModuloFila[]> {
  const rows = await db.orm.public.modulo.where({ activo: true }).orderBy((m) => m.orden.asc()).all();
  return rows
    .map((m) => ({
      id: m.id,
      clave: m.clave,
      nombre: m.nombre,
      grupo: m.grupo,
      ruta: m.ruta,
      orden: m.orden,
      admite_aprobar: m.admite_aprobar,
      admite_anular: m.admite_anular,
    }))
    .sort((a, b) => a.orden - b.orden || a.id - b.id);
}

/** Todos los módulos del catálogo (activos e inactivos) con su estado: los usa `PermisosGuard`. */
export async function leerTodosLosModulos(db: Db): Promise<(ModuloFila & { activo: boolean })[]> {
  const rows = await db.orm.public.modulo.orderBy((m) => m.orden.asc()).all();
  return rows.map((m) => ({
    id: m.id,
    clave: m.clave,
    nombre: m.nombre,
    grupo: m.grupo,
    ruta: m.ruta,
    orden: m.orden,
    admite_aprobar: m.admite_aprobar,
    admite_anular: m.admite_anular,
    activo: m.activo,
  }));
}

/** Filas guardadas de `rol_permiso` del rol, indexadas por `modulo_id`. */
export async function leerFilasPermiso(
  db: Db,
  rolId: number,
): Promise<Map<number, Readonly<Record<Accion, boolean>>>> {
  const rows = await db.orm.public.rol_permiso.where({ rol_id: rolId }).all();
  return new Map(
    rows.map((r) => [
      r.modulo_id,
      { ver: r.ver, crear: r.crear, editar: r.editar, eliminar: r.eliminar, aprobar: r.aprobar, anular: r.anular },
    ]),
  );
}

/** Rol por nombre exacto (como lo guarda `usuarios.Rol`); `null` si no existe o está vacío. */
export async function buscarRolPorNombre(db: Db, nombre: string): Promise<RolFila | null> {
  const buscado = nombre.trim();
  if (buscado === '' || !esVarchar(buscado, 50)) return null;
  const row = await db.orm.public.rol.first({ nombre: buscado });
  return row ? { id: row.id, nombre: row.nombre, es_sistema: row.es_sistema } : null;
}
