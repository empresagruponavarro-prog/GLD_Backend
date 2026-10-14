import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { hashClave } from '../../../platform/auth/passwords.js';
import {
  buscarUsuariosPorLogin,
  type UsuarioFila,
} from '../../../platform/auth/usuarios-login.js';
import { siguienteIdUsuario } from '../../../platform/auth/usuarios-id.js';
import { pgErrorCode } from '../../../platform/db/pg-errors.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { ordenarRoles } from '../rol/rol.handler.js';
import {
  CreateUsuarioDto,
  UpdateUsuarioDto,
  UsuarioResponseDto,
} from './usuario.dto.js';

type Varchar255 = Varchar<255>;

function toVarchar(value: string): Varchar255;
function toVarchar(value: string | undefined): Varchar255 | undefined;
function toVarchar(value: string | null | undefined): Varchar255 | null | undefined;
function toVarchar(value: string | null | undefined): Varchar255 | null | undefined {
  return value as unknown as Varchar255;
}

/** Mapeo explicito: la clave (hash) nunca sale en una respuesta. */
function toResponse(row: UsuarioFila): UsuarioResponseDto {
  return {
    IdUsuario: row.IdUsuario,
    Nombres: row.Nombres,
    Usuario: row.Usuario,
    Rol: row.Rol,
  };
}

/** Reintentos si dos altas simultáneas calculan el mismo correlativo (choque de clave primaria). */
const INTENTOS_ID = 5;

@Injectable()
export class UsuarioHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<UsuarioResponseDto[]> {
    const rows = await this.db.orm.public.Usuarios.orderBy((u) => u.IdUsuario.asc()).all();
    return rows.map(toResponse);
  }

  async getById(id: string): Promise<UsuarioResponseDto> {
    const row = await this.db.orm.public.Usuarios.first({
      IdUsuario: toVarchar(id),
    });
    if (!row) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return toResponse(row);
  }

  /** Crea el usuario asignándole el siguiente correlativo USR-NNNN. */
  async create(dto: CreateUsuarioDto): Promise<UsuarioResponseDto> {
    await this.assertRolExiste(dto.Rol);
    await this.assertLoginLibre(dto.Usuario);
    const clave = await hashClave(dto.Clave);

    for (let intento = 1; ; intento++) {
      const ids = (await this.db.orm.public.Usuarios.all()).map((u) => String(u.IdUsuario));
      const id = siguienteIdUsuario(ids);
      try {
        const row = await this.db.orm.public.Usuarios.create({
          IdUsuario: toVarchar(id),
          Nombres: toVarchar(dto.Nombres),
          Usuario: toVarchar(dto.Usuario.trim()),
          Clave: toVarchar(clave),
          Rol: toVarchar(dto.Rol),
        });
        return toResponse(row);
      } catch (error) {
        // Otra alta tomó el mismo número: se recalcula con el siguiente.
        if (pgErrorCode(error) === '23505' && intento < INTENTOS_ID) continue;
        if (pgErrorCode(error) === '23505') {
          throw new ConflictException('No se pudo asignar un código de usuario. Inténtalo de nuevo.');
        }
        throw error;
      }
    }
  }

  async update(id: string, dto: UpdateUsuarioDto): Promise<UsuarioResponseDto> {
    const updateData: {
      Nombres?: Varchar255;
      Usuario?: Varchar255;
      Clave?: Varchar255;
      Rol?: Varchar255;
    } = {};

    if (dto.Rol !== undefined) await this.assertRolExiste(dto.Rol);
    if (dto.Usuario !== undefined) {
      await this.assertLoginLibre(dto.Usuario, id);
      updateData.Usuario = toVarchar(dto.Usuario.trim());
    }
    if (dto.Nombres !== undefined) updateData.Nombres = toVarchar(dto.Nombres);
    if (dto.Clave !== undefined) updateData.Clave = toVarchar(await hashClave(dto.Clave));
    if (dto.Rol !== undefined) updateData.Rol = toVarchar(dto.Rol);

    const row = await this.db.orm.public.Usuarios.where({
      IdUsuario: toVarchar(id),
    }).update(updateData);

    if (!row) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return toResponse(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.db.orm.public.Usuarios.where({
      IdUsuario: toVarchar(id),
    }).delete();

    if (!row) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
  }

  /** Nombres de la tabla `rol`, en el mismo orden que GET /administration/roles. */
  async getRoles(): Promise<string[]> {
    const rows = await this.db.orm.public.rol.orderBy((r) => r.nombre.asc()).all();
    return ordenarRoles(rows).map((r) => String(r.nombre));
  }

  /** 400 si el rol no existe en la tabla `rol` (comparación exacta del nombre). */
  private async assertRolExiste(rol: string): Promise<void> {
    const existe = await this.db.orm.public.rol.first({ nombre: rol as unknown as Varchar<50> });
    if (!existe) throw new BadRequestException(`El rol "${rol}" no existe`);
  }

  /** 409 si otro usuario ya usa ese login (sin distinguir mayusculas). */
  private async assertLoginLibre(login: string, exceptoId?: string): Promise<void> {
    const otros = (await buscarUsuariosPorLogin(this.db, login)).filter(
      (u) => u.IdUsuario !== exceptoId,
    );
    if (otros.length > 0) {
      throw new ConflictException(`Ya existe un usuario con el login ${login.trim()}`);
    }
  }
}