import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import type { AuthUser } from '../../../../platform/auth/auth-user.js';
import {
  buscarRolPorNombre,
  leerFilasPermiso,
  leerFilasPermisoUsuario,
  leerModulosActivos,
  leerModulosDeArea,
  type ModuloFila,
} from '../../../../platform/auth/permisos-bd.js';
import { PermisosRolService } from '../../../../platform/auth/permisos-rol.js';
import {
  SIN_PERMISOS,
  detallePermisosModulo,
  esModuloAdministracion,
  permisosAdministrador,
  permisosEfectivos,
  type Accion,
  type Permisos,
} from '../../../../platform/auth/permisos.js';
import { esVarchar } from '../../../../platform/db/varchar.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import type { PermisoEntradaDto } from '../matriz/matriz.dto.js';
import type { PermisoUsuarioModuloDto, PermisosUsuarioDto } from './excepciones.dto.js';

export const SOLO_ADMINISTRADOR = 'Solo el Administrador puede gestionar los permisos personalizados de un usuario';
export const NO_PROPIOS = 'No puedes modificar tus propios permisos';

const noEncontrado = (id: string) => new NotFoundException(`Usuario con ID ${id} no encontrado`);
const esAdministradorBloqueado = (nombre: string) =>
  new ConflictException(`El usuario "${nombre}" tiene rol Administrador: tiene todos los permisos y no admite excepciones`);

type Varchar255 = Varchar<255>;

/** Fila a insertar en `usuario_permiso`. */
interface FilaNueva {
  usuario_id: Varchar255;
  modulo_id: number;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  aprobar: boolean;
  anular: boolean;
}

type FilasPorModulo = ReadonlyMap<number, Readonly<Record<Accion, boolean>>>;

/**
 * Excepciones de permisos por usuario (plan 08, Enfoque B): se SUMAN al rol y al área, módulo por
 * módulo. Solo el Administrador las gestiona; nadie las toca para sí mismo ni para un Administrador;
 * y nunca sobre los módulos de Administración. Cada cambio queda en el log.
 */
@Injectable()
export class ExcepcionesPermisosHandler {
  private readonly logger = new Logger(ExcepcionesPermisosHandler.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly permisosRol: PermisosRolService,
  ) {}

  /** Permisos del usuario módulo por módulo, con el origen de cada uno (rol / área / excepción). */
  async obtener(id: string): Promise<PermisosUsuarioDto> {
    if (!esVarchar(id, 255)) throw noEncontrado(id);
    const usuario = await this.db.orm.public.Usuarios.first({ IdUsuario: id });
    if (!usuario) throw noEncontrado(id);

    const rolNombre = (usuario.Rol ?? '').trim();
    const rol = await buscarRolPorNombre(this.db, rolNombre);
    const esAdministrador = rol?.es_sistema ?? false;

    const [modulos, filasRol, area, filasUsuario, areaFila] = await Promise.all([
      leerModulosActivos(this.db),
      rol && !rol.es_sistema ? leerFilasPermiso(this.db, rol.id) : Promise.resolve<FilasPorModulo>(new Map()),
      usuario.id_area === null ? Promise.resolve(null) : leerModulosDeArea(this.db, usuario.id_area),
      leerFilasPermisoUsuario(this.db, id),
      usuario.id_area === null ? Promise.resolve(null) : this.db.orm.public.area.first({ id: usuario.id_area }),
    ]);

    return {
      id_usuario: usuario.IdUsuario,
      nombres: usuario.Nombres ?? '',
      usuario: usuario.Usuario ?? '',
      rol: rolNombre,
      area: areaFila ? { id: areaFila.id, codigo: areaFila.codigo, nombre: areaFila.nombre } : null,
      area_configurada: area !== null,
      es_administrador: esAdministrador,
      personalizado: filasUsuario.size > 0,
      modulos: modulos.map((m): PermisoUsuarioModuloDto => {
        const base = {
          id: m.id,
          clave: m.clave,
          nombre: m.nombre,
          grupo: m.grupo,
          admite_aprobar: m.admite_aprobar,
          admite_anular: m.admite_anular,
        };
        if (esAdministrador) {
          const todo = permisosAdministrador(m);
          return { ...base, area: 'sin_restriccion', rol: todo, tras_area: todo, excepcion: null, efectivo: todo, origen: 'rol' };
        }
        const delRol: Permisos = rol ? permisosEfectivos(m, false, filasRol.get(m.id)) : SIN_PERMISOS;
        const excepcion = filasUsuario.get(m.id);
        const detalle = detallePermisosModulo({ modulo: m, rol: delRol, area, excepcion });
        return {
          ...base,
          area: detalle.area,
          rol: detalle.rol,
          tras_area: detalle.tras_area,
          excepcion: excepcion ? permisosEfectivos(m, false, excepcion) : null,
          efectivo: detalle.efectivo,
          origen: detalle.origen,
        };
      }),
    };
  }

  /** Reemplaza TODAS las excepciones del usuario en una transacción (todo o nada). */
  async reemplazar(id: string, entradas: readonly PermisoEntradaDto[], actor: AuthUser): Promise<PermisosUsuarioDto> {
    const usuarioId = await this.validarCambio(id, actor);
    const modulos = await leerModulosActivos(this.db);
    const { filas, errores } = this.validarEntradas(usuarioId, modulos, entradas);
    if (errores.length > 0) {
      throw new BadRequestException({ statusCode: 400, message: errores, error: 'Bad Request' });
    }

    await this.db.transaction(async (tx) => {
      await tx.orm.public.usuario_permiso.where({ usuario_id: usuarioId }).deleteAndCount();
      if (filas.length > 0) await tx.orm.public.usuario_permiso.createAndCount(filas);
    });
    this.permisosRol.invalidarUsuario(usuarioId);
    const claves = entradas.map((e) => e.clave).join(', ');
    this.logger.log(`${actor.id} dejó ${filas.length} excepción(es) de permisos a ${usuarioId}${claves ? `: ${claves}` : ''}`);
    // La respuesta se arma después del commit.
    return this.obtener(usuarioId);
  }

  /** Quita todas las excepciones: el usuario vuelve a lo que dan su rol y su área. */
  async restablecer(id: string, actor: AuthUser): Promise<PermisosUsuarioDto> {
    const usuarioId = await this.validarCambio(id, actor);
    await this.db.orm.public.usuario_permiso.where({ usuario_id: usuarioId }).deleteAndCount();
    this.permisosRol.invalidarUsuario(usuarioId);
    this.logger.log(`${actor.id} restableció los permisos de ${usuarioId} a los de su rol y su área`);
    return this.obtener(usuarioId);
  }

  /**
   * Reglas de seguridad comunes: solo el Administrador, nunca sobre uno mismo, el usuario debe
   * existir y no puede ser Administrador. Devuelve el id ya validado como Varchar.
   */
  private async validarCambio(id: string, actor: AuthUser): Promise<Varchar255> {
    const permisosActor = await this.permisosRol.obtener(actor.rol);
    if (!permisosActor.esAdministrador) throw new ForbiddenException(SOLO_ADMINISTRADOR);
    if (id === actor.id) throw new ConflictException(NO_PROPIOS);
    if (!esVarchar(id, 255)) throw noEncontrado(id);
    const usuario = await this.db.orm.public.Usuarios.first({ IdUsuario: id });
    if (!usuario) throw noEncontrado(id);
    const rol = await buscarRolPorNombre(this.db, (usuario.Rol ?? '').trim());
    if (rol?.es_sistema) throw esAdministradorBloqueado(usuario.Usuario ?? id);
    return id;
  }

  private validarEntradas(
    usuarioId: Varchar255,
    modulos: readonly ModuloFila[],
    entradas: readonly PermisoEntradaDto[],
  ): { filas: FilaNueva[]; errores: string[] } {
    const porClave = new Map(modulos.map((m) => [m.clave, m]));
    const vistas = new Set<string>();
    const errores: string[] = [];
    const filas: FilaNueva[] = [];
    for (const e of entradas) {
      const modulo = porClave.get(e.clave);
      if (!modulo) {
        errores.push(`Módulo desconocido o inactivo: "${e.clave}"`);
        continue;
      }
      if (esModuloAdministracion(modulo.clave)) {
        errores.push(`"${modulo.clave}" es de Administración: solo se da por el rol`);
        continue;
      }
      if (vistas.has(modulo.clave)) {
        errores.push(`Módulo repetido: "${modulo.clave}"`);
        continue;
      }
      vistas.add(modulo.clave);
      if (e.aprobar && !modulo.admite_aprobar) errores.push(`"${modulo.clave}" no admite Aprobar`);
      if (e.anular && !modulo.admite_anular) errores.push(`"${modulo.clave}" no admite Anular`);
      if (!e.ver && (e.crear || e.editar || e.eliminar || e.aprobar || e.anular)) {
        errores.push(`"${modulo.clave}": cualquier acción requiere Ver`);
      }
      filas.push({
        usuario_id: usuarioId,
        modulo_id: modulo.id,
        ver: e.ver,
        crear: e.crear,
        editar: e.editar,
        eliminar: e.eliminar,
        aprobar: e.aprobar,
        anular: e.anular,
      });
    }
    return { filas, errores };
  }
}
