import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { DB, type Database } from '../../../prisma/prisma.module.js';
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

const DEFAULT_ROLES = ['Administrador', 'Promotor', 'Supervisor', 'Usuario'];

@Injectable()
export class UsuarioHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<UsuarioResponseDto[]> {
    return this.db.orm.public.Usuarios.orderBy((u) => u.IdUsuario.asc()).all();
  }

  async getById(id: string): Promise<UsuarioResponseDto> {
    const row = await this.db.orm.public.Usuarios.first({
      IdUsuario: toVarchar(id),
    });
    if (!row) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return row;
  }

  async create(dto: CreateUsuarioDto): Promise<UsuarioResponseDto> {
    const existing = await this.db.orm.public.Usuarios.first({
      IdUsuario: toVarchar(dto.IdUsuario),
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un usuario con el identificador ${dto.IdUsuario}`,
      );
    }

    return this.db.orm.public.Usuarios.create({
      IdUsuario: toVarchar(dto.IdUsuario),
      Nombres: toVarchar(dto.Nombres),
      Usuario: toVarchar(dto.Usuario),
      Clave: toVarchar(dto.Clave ?? '123456'),
      Rol: toVarchar(dto.Rol ?? 'Usuario'),
    });
  }

  async update(id: string, dto: UpdateUsuarioDto): Promise<UsuarioResponseDto> {
    const updateData: {
      Nombres?: Varchar255;
      Usuario?: Varchar255;
      Clave?: Varchar255;
      Rol?: Varchar255;
    } = {};

    if (dto.Nombres !== undefined) updateData.Nombres = toVarchar(dto.Nombres);
    if (dto.Usuario !== undefined) updateData.Usuario = toVarchar(dto.Usuario);
    if (dto.Clave !== undefined) updateData.Clave = toVarchar(dto.Clave);
    if (dto.Rol !== undefined) updateData.Rol = toVarchar(dto.Rol);

    const row = await this.db.orm.public.Usuarios.where({
      IdUsuario: toVarchar(id),
    }).update(updateData);

    if (!row) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return row;
  }

  async remove(id: string): Promise<void> {
    const row = await this.db.orm.public.Usuarios.where({
      IdUsuario: toVarchar(id),
    }).delete();

    if (!row) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
  }

  async getRoles(): Promise<string[]> {
    const users = await this.db.orm.public.Usuarios.all();
    const roles = Array.from(
      new Set(
        users
          .map((u) => (u.Rol ? String(u.Rol).trim() : ''))
          .filter((r) => r.length > 0),
      ),
    );
    return roles.length > 0 ? roles : DEFAULT_ROLES;
  }
}