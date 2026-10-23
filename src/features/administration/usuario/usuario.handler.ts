import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { hashClave } from '../../../platform/auth/usuarios/passwords.js';
import { SesionUsuariosService } from '../../../platform/auth/usuarios/sesion-usuarios.js';
import {
  buscarUsuariosPorLogin,
  type UsuarioFila,
} from '../../../platform/auth/usuarios/usuarios-login.js';
import { siguienteIdUsuario } from '../../../platform/auth/usuarios/usuarios-id.js';
import { pgErrorCode } from '../../../platform/db/pg-errors.js';
import { esVarchar } from '../../../platform/db/varchar.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { ordenarRoles } from '../rol/rol.handler.js';
import { AreaUsuarioInfo, CreateUsuarioDto, UpdateUsuarioDto, UsuarioResponseDto } from './usuario.dto.js';

type Varchar255 = Varchar<255>;
/** Transacción de la ORM (lo que recibe el callback de `db.transaction`). */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Fila de `usuarios` con su área. */
type FilaUsuario = UsuarioFila & { id_area: number | null };

export const NO_DESACTIVARSE = 'No puedes desactivar tu propio usuario';
export const ULTIMO_ADMINISTRADOR = 'Debe quedar al menos un Administrador activo';
export const NO_ELIMINARSE = 'No puedes eliminar tu propio usuario';

/** Los DTO ya limitan a 255; si llegara algo más largo es un 400 (no se trunca). */
function v255(valor: string): Varchar255 {
  if (!esVarchar(valor, 255)) throw new BadRequestException('El valor supera 255 caracteres');
  return valor;
}

const noEncontrado = (id: string) => new NotFoundException(`Usuario con ID ${id} no encontrado`);

const infoArea = (area: { id: number; codigo: string; nombre: string }): AreaUsuarioInfo => ({
  id: area.id,
  codigo: area.codigo,
  nombre: area.nombre,
});

/** Mapeo explicito: la clave (hash) nunca sale en una respuesta. */
function toResponse(row: FilaUsuario, area: AreaUsuarioInfo | null, personalizado: boolean): UsuarioResponseDto {
  return {
    IdUsuario: row.IdUsuario,
    Nombres: row.Nombres,
    Usuario: row.Usuario,
    Rol: row.Rol,
    activo: row.activo,
    id_area: row.id_area,
    area,
    tiene_permisos_personalizados: personalizado,
  };
}

/** Reintentos si dos altas simultáneas calculan el mismo correlativo (choque de clave primaria). */
const INTENTOS_ID = 5;

/** Nombres (sin espacios extremos) de los roles de sistema: el "Administrador". */
async function nombresRolSistema(tx: Tx): Promise<Set<string>> {
  const sistema = await tx.orm.public.rol.where({ es_sistema: true }).all();
  return new Set(sistema.map((r) => r.nombre.trim()));
}

/**
 * 409 si, sin el usuario `id`, no quedaría ningún Administrador activo. Para que dos operaciones
 * simultáneas (desactivar, cambiar el rol o borrar) no dejen el sistema sin Administrador, se
 * bloquean (UPDATE sin cambios) las filas de los Administradores activos antes de contarlos,
 * dentro de la transacción del llamador.
 */
async function asegurarOtroAdministradorActivo(tx: Tx, id: string, sistema: ReadonlySet<string>): Promise<void> {
  for (const nombre of sistema) {
    if (!esVarchar(nombre, 255)) continue;
    await tx.orm.public.Usuarios.where({ Rol: nombre, activo: true }).updateAndCount({ activo: true });
  }
  const activos = await tx.orm.public.Usuarios.where({ activo: true }).all();
  const otros = activos.filter((u) => u.IdUsuario !== id && sistema.has((u.Rol ?? '').trim()));
  if (otros.length === 0) throw new ConflictException(ULTIMO_ADMINISTRADOR);
}

@Injectable()
export class UsuarioHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sesiones: SesionUsuariosService,
  ) {}

  async list(): Promise<UsuarioResponseDto[]> {
    const [rows, areas, conExcepciones] = await Promise.all([
      this.db.orm.public.Usuarios.orderBy((u) => u.IdUsuario.asc()).all(),
      this.db.orm.public.area.all(),
      this.db.orm.public.usuario_permiso.all(),
    ]);
    const areaPorId = new Map(areas.map((a) => [a.id, infoArea(a)]));
    const personalizados = new Set(conExcepciones.map((p) => p.usuario_id));
    return rows.map((r) =>
      toResponse(r, r.id_area === null ? null : (areaPorId.get(r.id_area) ?? null), personalizados.has(r.IdUsuario)),
    );
  }

  async getById(id: string): Promise<UsuarioResponseDto> {
    if (!esVarchar(id, 255)) throw noEncontrado(id);
    const row = await this.db.orm.public.Usuarios.first({ IdUsuario: id });
    if (!row) throw noEncontrado(id);
    const [area, excepcion] = await Promise.all([
      this.areaInfoDe(row.id_area),
      this.db.orm.public.usuario_permiso.first({ usuario_id: id }),
    ]);
    return toResponse(row, area, excepcion !== null);
  }

  /** Crea el usuario (activo) asignándole el siguiente correlativo USR-NNNN. */
  async create(dto: CreateUsuarioDto): Promise<UsuarioResponseDto> {
    await this.assertRolExiste(dto.Rol);
    await this.assertLoginLibre(dto.Usuario);
    const idArea = dto.id_area ?? null;
    if (idArea !== null) await this.assertAreaExiste(idArea);
    const clave = await hashClave(dto.Clave);

    for (let intento = 1; ; intento++) {
      const ids = (await this.db.orm.public.Usuarios.all()).map((u) => String(u.IdUsuario));
      const id = siguienteIdUsuario(ids);
      try {
        const row = await this.db.orm.public.Usuarios.create({
          IdUsuario: v255(id),
          Nombres: v255(dto.Nombres),
          Usuario: v255(dto.Usuario.trim()),
          Clave: v255(clave),
          Rol: v255(dto.Rol),
          activo: true,
          id_area: idArea,
        });
        this.sesiones.invalidar(id);
        return toResponse(row, await this.areaInfoDe(row.id_area), false);
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

  /**
   * Actualiza los campos enviados. Si cambia el Rol de un Administrador activo (rol de sistema) a
   * otro que no lo es, se exige que quede otro Administrador activo, con el mismo bloqueo que
   * `cambiarEstado`, dentro de la transacción que hace el cambio.
   */
  async update(id: string, dto: UpdateUsuarioDto): Promise<UsuarioResponseDto> {
    if (!esVarchar(id, 255)) throw noEncontrado(id);
    const updateData: {
      Nombres?: Varchar255;
      Usuario?: Varchar255;
      Clave?: Varchar255;
      Rol?: Varchar255;
      id_area?: number | null;
    } = {};

    if (dto.Rol !== undefined) await this.assertRolExiste(dto.Rol);
    if (dto.Usuario !== undefined) {
      await this.assertLoginLibre(dto.Usuario, id);
      updateData.Usuario = v255(dto.Usuario.trim());
    }
    if (dto.Nombres !== undefined) updateData.Nombres = v255(dto.Nombres);
    if (dto.Clave !== undefined) updateData.Clave = v255(await hashClave(dto.Clave));
    if (dto.Rol !== undefined) updateData.Rol = v255(dto.Rol);
    if (dto.id_area !== undefined) {
      if (dto.id_area !== null) await this.assertAreaExiste(dto.id_area);
      updateData.id_area = dto.id_area;
    }

    const nuevoRol = dto.Rol;
    const row =
      nuevoRol === undefined
        ? await this.db.orm.public.Usuarios.where({ IdUsuario: id }).update(updateData)
        : await this.db.transaction(async (tx) => {
            const actual = await tx.orm.public.Usuarios.first({ IdUsuario: id });
            if (!actual) throw noEncontrado(id);
            const sistema = await nombresRolSistema(tx);
            const dejaDeSerAdmin = sistema.has((actual.Rol ?? '').trim()) && !sistema.has(nuevoRol.trim());
            if (actual.activo && dejaDeSerAdmin) await asegurarOtroAdministradorActivo(tx, id, sistema);
            return tx.orm.public.Usuarios.where({ IdUsuario: id }).update(updateData);
          });
    if (!row) throw noEncontrado(id);
    // El rol y el área vigentes los lee JwtAuthGuard de la BD: se aplican sin volver a entrar.
    this.sesiones.invalidar(id);
    const excepcion = await this.db.orm.public.usuario_permiso.first({ usuario_id: id });
    return toResponse(row, await this.areaInfoDe(row.id_area), excepcion !== null);
  }

  /**
   * Nadie puede eliminarse a sí mismo (409) ni eliminar al último Administrador activo (409, con
   * el mismo bloqueo que `cambiarEstado`).
   */
  async remove(id: string, actorId: string): Promise<void> {
    if (!esVarchar(id, 255)) throw noEncontrado(id);
    if (id === actorId) throw new ConflictException(NO_ELIMINARSE);
    await this.db.transaction(async (tx) => {
      const actual = await tx.orm.public.Usuarios.first({ IdUsuario: id });
      if (!actual) throw noEncontrado(id);
      const sistema = await nombresRolSistema(tx);
      if (actual.activo && sistema.has((actual.Rol ?? '').trim())) {
        await asegurarOtroAdministradorActivo(tx, id, sistema);
      }
      const borrado = await tx.orm.public.Usuarios.where({ IdUsuario: id }).delete();
      if (!borrado) throw noEncontrado(id);
    });
    this.sesiones.invalidar(id);
  }

  /**
   * Desactiva o reactiva un usuario (D6). Nadie puede desactivarse a sí mismo ni dejar el
   * sistema sin un Administrador activo (`asegurarOtroAdministradorActivo`).
   */
  async cambiarEstado(id: string, activo: boolean, actorId: string): Promise<UsuarioResponseDto> {
    if (!esVarchar(id, 255)) throw noEncontrado(id);

    await this.db.transaction(async (tx) => {
      const actual = await tx.orm.public.Usuarios.first({ IdUsuario: id });
      if (!actual) throw noEncontrado(id);
      if (activo || !actual.activo) {
        await tx.orm.public.Usuarios.where({ IdUsuario: id }).update({ activo });
        return;
      }
      if (id === actorId) throw new ConflictException(NO_DESACTIVARSE);

      const sistema = await nombresRolSistema(tx);
      if (sistema.has((actual.Rol ?? '').trim())) await asegurarOtroAdministradorActivo(tx, id, sistema);
      await tx.orm.public.Usuarios.where({ IdUsuario: id }).update({ activo: false });
    });

    this.sesiones.invalidar(id);
    // La respuesta se arma después del commit.
    return this.getById(id);
  }

  /** Nombres de la tabla `rol`, en el mismo orden que GET /administration/roles. */
  async getRoles(): Promise<string[]> {
    const rows = await this.db.orm.public.rol.orderBy((r) => r.nombre.asc()).all();
    return ordenarRoles(rows).map((r) => String(r.nombre));
  }

  /** Datos del área de un usuario; `null` si no tiene área. */
  private async areaInfoDe(idArea: number | null): Promise<AreaUsuarioInfo | null> {
    if (idArea === null) return null;
    const area = await this.db.orm.public.area.first({ id: idArea });
    return area ? infoArea(area) : null;
  }

  /** 400 si el área no existe en la tabla `area`. */
  private async assertAreaExiste(idArea: number): Promise<void> {
    const area = await this.db.orm.public.area.first({ id: idArea });
    if (!area) throw new BadRequestException(`El área con ID ${idArea} no existe`);
  }

  /** 400 si el rol no existe en la tabla `rol` (comparación exacta del nombre). */
  private async assertRolExiste(rol: string): Promise<void> {
    const existe = esVarchar(rol, 50) ? await this.db.orm.public.rol.first({ nombre: rol }) : null;
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
