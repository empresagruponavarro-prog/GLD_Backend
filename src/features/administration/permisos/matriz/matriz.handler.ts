import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  leerFilasPermiso,
  leerModulosActivos,
  type ModuloFila,
  type RolFila,
} from '../../../../platform/auth/permisos-bd.js';
import { ACCIONES, permisosEfectivos, type Accion } from '../../../../platform/auth/permisos.js';
import { PermisosRolService } from '../../../../platform/auth/permisos-rol.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import { MatrizPermisosDto, PermisoEntradaDto } from './matriz.dto.js';

const ETIQUETA_ACCION = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  aprobar: 'Aprobar',
  anular: 'Anular',
} as const;

const rolNoEncontrado = (id: number) => new NotFoundException(`Rol con id ${id} no encontrado`);
const rolBloqueado = (nombre: string) =>
  new ConflictException(`El rol "${nombre}" tiene todos los permisos y no se puede modificar`);

/** Fila a insertar en `rol_permiso`. */
interface FilaNueva {
  rol_id: number;
  modulo_id: number;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  aprobar: boolean;
  anular: boolean;
}

/**
 * Valida que la matriz enviada traiga exactamente una entrada por módulo activo y que sea
 * coherente. Devuelve las filas a guardar (solo las que tienen `ver`: sin fila = todo denegado)
 * o la lista de errores.
 */
export function validarMatriz(
  rolId: number,
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
      errores.push(`Clave de módulo desconocida: "${e.clave}"`);
      continue;
    }
    if (vistas.has(e.clave)) {
      errores.push(`Módulo repetido: "${e.clave}"`);
      continue;
    }
    vistas.add(e.clave);
    if (e.aprobar && !modulo.admite_aprobar) errores.push(`"${e.clave}" no admite Aprobar`);
    if (e.anular && !modulo.admite_anular) errores.push(`"${e.clave}" no admite Anular`);
    if (!e.ver) {
      for (const accion of ACCIONES) {
        if (accion !== 'ver' && e[accion]) {
          errores.push(`"${e.clave}": ${ETIQUETA_ACCION[accion]} requiere Ver`);
        }
      }
      continue;
    }
    filas.push({
      rol_id: rolId,
      modulo_id: modulo.id,
      ver: true,
      crear: e.crear,
      editar: e.editar,
      eliminar: e.eliminar,
      aprobar: e.aprobar,
      anular: e.anular,
    });
  }
  for (const m of modulos) {
    if (!vistas.has(m.clave)) {
      errores.push(`Falta el módulo "${m.clave}"`);
    }
  }
  return { filas, errores };
}

@Injectable()
export class MatrizPermisosHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly permisosRol: PermisosRolService,
  ) {}

  /** Una entrada por módulo activo; el Administrador (rol de sistema) lo tiene todo y está bloqueado. */
  async obtener(id: number): Promise<MatrizPermisosDto> {
    const rol = await this.buscarRol(id);
    const modulos = await leerModulosActivos(this.db);
    // El Administrador no tiene filas: sus permisos son implícitos.
    const guardadas: ReadonlyMap<number, Readonly<Record<Accion, boolean>>> = rol.es_sistema
      ? new Map<number, Readonly<Record<Accion, boolean>>>()
      : await leerFilasPermiso(this.db, id);
    return {
      rolId: rol.id,
      rol: rol.nombre,
      esSistema: rol.es_sistema,
      bloqueado: rol.es_sistema,
      permisos: modulos.map((m) => ({
        moduloId: m.id,
        clave: m.clave,
        ...permisosEfectivos(m, rol.es_sistema, guardadas.get(m.id)),
      })),
    };
  }

  /**
   * Reemplaza la matriz completa del rol en UNA transacción. Antes de borrar se bloquea la fila
   * del rol (UPDATE sin cambios) para serializar dos guardados simultáneos del mismo rol.
   */
  async reemplazar(id: number, entradas: readonly PermisoEntradaDto[]): Promise<MatrizPermisosDto> {
    const rol = await this.buscarRol(id);
    if (rol.es_sistema) throw rolBloqueado(rol.nombre);

    const modulos = await leerModulosActivos(this.db);
    const { filas, errores } = validarMatriz(id, modulos, entradas);
    if (errores.length > 0) {
      throw new BadRequestException({ statusCode: 400, message: errores, error: 'Bad Request' });
    }

    await this.db.transaction(async (tx) => {
      const bloqueado = await tx.orm.public.rol
        .where({ id, es_sistema: false })
        .update({ es_sistema: false });
      if (!bloqueado) throw rolNoEncontrado(id);
      await tx.orm.public.rol_permiso.where({ rol_id: id }).deleteAndCount();
      if (filas.length > 0) await tx.orm.public.rol_permiso.createAndCount(filas);
    });
    // La API aplica la matriz nueva ya, sin esperar a que venza la caché del rol.
    this.permisosRol.invalidarRol(rol.nombre);
    // La respuesta se arma después del commit.
    return this.obtener(id);
  }

  private async buscarRol(id: number): Promise<RolFila> {
    const row = await this.db.orm.public.rol.first({ id });
    if (!row) throw rolNoEncontrado(id);
    return { id: row.id, nombre: row.nombre, es_sistema: row.es_sistema };
  }
}
