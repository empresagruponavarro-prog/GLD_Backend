import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { PermisosRolService } from '../../../platform/auth/permisos/permisos-rol.js';
import { SesionUsuariosService } from '../../../platform/auth/usuarios/sesion-usuarios.js';
import { pgErrorCode } from '../../../platform/db/pg-errors.js';
import { esVarchar } from '../../../platform/db/varchar.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { CreateRolDto, RolResponseDto, UpdateRolDto } from './rol.dto.js';

/**
 * Las columnas varchar son tipos con marca; `esVarchar` valida la longitud y estrecha el tipo.
 * Los DTO ya limitan las longitudes: el 400 solo protege de un uso sin validar.
 */
function varchar<N extends number>(valor: string, max: N): Varchar<N> {
  if (!esVarchar(valor, max)) throw new BadRequestException(`El valor supera ${max} caracteres`);
  return valor;
}
const v50 = (valor: string) => varchar(valor, 50);
const v255 = (valor: string) => varchar(valor, 255);
const v255n = (valor: string | null) => (valor === null ? null : varchar(valor, 255));

interface RolFila {
  id: number;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
}

/** Comparación de nombres sin distinguir mayúsculas. */
const clave = (nombre: string) => nombre.trim().toLocaleLowerCase('es');

/** Descripción vacía o solo espacios se guarda como NULL. */
function normalizarDescripcion(valor: string | null | undefined): string | null {
  const texto = (valor ?? '').trim();
  return texto === '' ? null : texto;
}

function toResponse(row: RolFila, usuarios: number): RolResponseDto {
  return {
    id: row.id,
    nombre: String(row.nombre),
    descripcion: row.descripcion === null ? null : String(row.descripcion),
    es_sistema: row.es_sistema,
    usuarios,
  };
}

/**
 * Orden de los listados: primero los roles del sistema y luego por nombre.
 * (Postgres no ordena booleanos por la ORM; el nombre ya llega ordenado y el
 * sort es estable.) También lo usa GET /administration/usuarios/roles.
 */
export function ordenarRoles<T extends { es_sistema: boolean }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => Number(b.es_sistema) - Number(a.es_sistema));
}

const conflictoDuplicado = (nombre: string) =>
  new ConflictException(`Ya existe un rol llamado "${nombre}"`);

@Injectable()
export class RolHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sesiones: SesionUsuariosService,
    private readonly permisosRol: PermisosRolService,
  ) {}

  /** Roles con su cantidad de usuarios: primero los del sistema y luego por nombre. */
  async list(): Promise<RolResponseDto[]> {
    const [rows, conteos] = await Promise.all([
      this.db.orm.public.rol.orderBy((r) => r.nombre.asc()).all(),
      this.db.orm.public.Usuarios.groupBy('Rol').aggregate((a) => ({ n: a.count() })),
    ]);
    const porNombre = new Map<string, number>();
    for (const c of conteos) {
      if (c.Rol !== null) porNombre.set(String(c.Rol), Number(c.n));
    }
    return ordenarRoles(rows).map((r) => toResponse(r, porNombre.get(String(r.nombre)) ?? 0));
  }

  async getById(id: number): Promise<RolResponseDto> {
    const row = await this.buscar(id);
    return toResponse(row, await this.contarUsuarios(String(row.nombre)));
  }

  async create(dto: CreateRolDto): Promise<RolResponseDto> {
    const nombre = dto.nombre.trim();
    const existentes = await this.db.orm.public.rol.all();
    if (existentes.some((r) => clave(String(r.nombre)) === clave(nombre))) {
      throw conflictoDuplicado(nombre);
    }
    try {
      const row = await this.db.orm.public.rol.create({
        nombre: v50(nombre),
        descripcion: v255n(normalizarDescripcion(dto.descripcion)),
        es_sistema: false,
      });
      return toResponse(row, 0);
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw conflictoDuplicado(nombre);
      throw error;
    }
  }

  /**
   * Renombrar actualiza `usuarios.Rol` de quienes tenían el nombre anterior en
   * la MISMA transacción. Un rol del sistema solo admite cambiar la descripción.
   */
  async update(id: number, dto: UpdateRolDto): Promise<RolResponseDto> {
    try {
      await this.db.transaction(async (tx) => {
        const actual = await tx.orm.public.rol.first({ id });
        if (!actual) throw new NotFoundException(`Rol con id ${id} no encontrado`);

        const anterior = String(actual.nombre);
        const nuevo = dto.nombre?.trim();
        const renombrar = nuevo !== undefined && nuevo !== anterior;
        const data: { nombre?: Varchar<50>; descripcion?: Varchar<255> | null } = {};

        if (renombrar) {
          if (actual.es_sistema) {
            throw new ConflictException(`El rol "${anterior}" es del sistema y no se puede renombrar`);
          }
          const otros = await tx.orm.public.rol.all();
          if (otros.some((r) => r.id !== id && clave(String(r.nombre)) === clave(nuevo))) {
            throw conflictoDuplicado(nuevo);
          }
          data.nombre = v50(nuevo);
        }
        if (dto.descripcion !== undefined) {
          data.descripcion = v255n(normalizarDescripcion(dto.descripcion));
        }
        if (Object.keys(data).length === 0) return;

        await tx.orm.public.rol.where({ id }).update(data);
        if (renombrar) {
          await tx.orm.public.Usuarios.where({ Rol: v255(anterior) }).updateAndCount({
            Rol: v255(nuevo),
          });
        }
      });
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw conflictoDuplicado(dto.nombre?.trim() ?? '');
      throw error;
    }
    // Renombrar cambia usuarios.Rol: la caché de sesiones (rol vigente) se descarta.
    // La caché de permisos es por NOMBRE de rol: el nombre viejo deja de existir.
    if (dto.nombre !== undefined) {
      this.sesiones.invalidarTodo();
      this.permisosRol.invalidarTodo();
    }
    // La respuesta se arma después del commit.
    return this.getById(id);
  }

  async remove(id: number): Promise<void> {
    const row = await this.buscar(id);
    const nombre = String(row.nombre);
    if (row.es_sistema) {
      throw new ConflictException(`El rol "${nombre}" es del sistema y no se puede eliminar`);
    }
    const usuarios = await this.contarUsuarios(nombre);
    if (usuarios > 0) {
      throw new ConflictException(
        `No se puede eliminar "${nombre}": tiene ${usuarios} usuario(s) asignado(s). Reasígnalos primero.`,
      );
    }
    const borrado = await this.db.orm.public.rol.where({ id }).delete();
    if (!borrado) throw new NotFoundException(`Rol con id ${id} no encontrado`);
    this.permisosRol.invalidarRol(nombre);
  }

  private async buscar(id: number): Promise<RolFila> {
    const row = await this.db.orm.public.rol.first({ id });
    if (!row) throw new NotFoundException(`Rol con id ${id} no encontrado`);
    return row;
  }

  /** Usuarios cuyo `Rol` es exactamente `nombre`. */
  private async contarUsuarios(nombre: string): Promise<number> {
    const { n } = await this.db.orm.public.Usuarios.where({ Rol: v255(nombre) }).aggregate((a) => ({
      n: a.count(),
    }));
    return Number(n);
  }
}
