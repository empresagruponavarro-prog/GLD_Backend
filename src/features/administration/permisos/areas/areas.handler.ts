import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { leerModulosActivos } from '../../../../platform/auth/permisos/permisos-bd.js';
import { PermisosRolService } from '../../../../platform/auth/permisos/permisos-rol.js';
import { esModuloSinFiltroDeArea } from '../../../../platform/auth/permisos/permisos.js';
import { DB, type Database } from '../../../../prisma/prisma.module.js';
import {
  AccesoAreaDto,
  AreaMatrizDto,
  MatrizAreasDto,
  type AccesoAreaEntradaDto,
  type NivelAreaGuardable,
} from './areas.dto.js';

const areaNoEncontrada = (id: number) => new NotFoundException(`Área con id ${id} no encontrada`);

/** Fila de `area_modulo` ya validada, lista para insertar. */
interface FilaNueva {
  area_id: number;
  modulo_id: number;
  solo_lectura: boolean;
}

const nivelDe = (soloLectura: boolean): NivelAreaGuardable => (soloLectura ? 'solo_ver' : 'completo');

/**
 * Módulos por área (plan 08): qué módulos tiene habilitados cada área y con qué nivel (solo ver /
 * completo). El rol sigue dando las ACCIONES; el área decide QUÉ MÓDULOS ve la persona.
 */
@Injectable()
export class AreasPermisosHandler {
  private readonly logger = new Logger(AreasPermisosHandler.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly permisosRol: PermisosRolService,
  ) {}

  async matriz(): Promise<MatrizAreasDto> {
    const [modulos, areas, filas, usuarios] = await Promise.all([
      leerModulosActivos(this.db),
      this.db.orm.public.area.orderBy((a) => a.nombre.asc()).all(),
      this.db.orm.public.area_modulo.all(),
      this.db.orm.public.Usuarios.where({ activo: true }).all(),
    ]);
    const clavePorId = new Map(modulos.map((m) => [m.id, m.clave]));
    const modulosPorArea = new Map<number, AccesoAreaDto[]>();
    for (const fila of filas) {
      const clave = clavePorId.get(fila.modulo_id);
      if (clave === undefined) continue; // módulo inactivo: no se muestra
      const lista = modulosPorArea.get(fila.area_id) ?? [];
      lista.push({ clave, nivel: nivelDe(fila.solo_lectura) });
      modulosPorArea.set(fila.area_id, lista);
    }
    const habilitados = new Set(filas.map((f) => f.modulo_id));
    const usuariosPorArea = new Map<number, number>();
    for (const u of usuarios) {
      if (u.id_area !== null) usuariosPorArea.set(u.id_area, (usuariosPorArea.get(u.id_area) ?? 0) + 1);
    }

    return {
      modulos: modulos.map((m) => ({
        id: m.id,
        clave: m.clave,
        nombre: m.nombre,
        grupo: m.grupo,
        configurable: !esModuloSinFiltroDeArea(m.clave),
      })),
      areas: areas.map((a): AreaMatrizDto => {
        const lista = modulosPorArea.get(a.id) ?? [];
        return {
          id: a.id,
          codigo: a.codigo,
          nombre: a.nombre,
          estado: a.estado,
          usuarios: usuariosPorArea.get(a.id) ?? 0,
          configurada: lista.length > 0,
          modulos: lista,
        };
      }),
      sin_area: modulos
        .filter((m) => !esModuloSinFiltroDeArea(m.clave) && !habilitados.has(m.id))
        .map((m) => m.clave),
    };
  }

  /**
   * Reemplaza TODOS los módulos del área en una transacción. Rechaza (400) módulos desconocidos o
   * inactivos, los que no dependen del área (Administración y `modulos`) y los repetidos.
   */
  async reemplazar(idArea: number, entradas: readonly AccesoAreaEntradaDto[], actorId: string): Promise<AreaMatrizDto> {
    const area = await this.db.orm.public.area.first({ id: idArea });
    if (!area) throw areaNoEncontrada(idArea);

    const modulos = await leerModulosActivos(this.db);
    const porClave = new Map(modulos.map((m) => [m.clave, m]));
    const vistas = new Set<string>();
    const errores: string[] = [];
    const filas: FilaNueva[] = [];
    for (const entrada of entradas) {
      const modulo = porClave.get(entrada.clave);
      if (!modulo) {
        errores.push(`Módulo desconocido o inactivo: "${entrada.clave}"`);
        continue;
      }
      if (esModuloSinFiltroDeArea(modulo.clave)) {
        errores.push(`"${modulo.clave}" no depende del área (solo del rol)`);
        continue;
      }
      if (vistas.has(modulo.clave)) {
        errores.push(`Módulo repetido: "${modulo.clave}"`);
        continue;
      }
      vistas.add(modulo.clave);
      filas.push({ area_id: idArea, modulo_id: modulo.id, solo_lectura: entrada.nivel === 'solo_ver' });
    }
    if (errores.length > 0) {
      throw new BadRequestException({ statusCode: 400, message: errores, error: 'Bad Request' });
    }

    await this.db.transaction(async (tx) => {
      await tx.orm.public.area_modulo.where({ area_id: idArea }).deleteAndCount();
      if (filas.length > 0) await tx.orm.public.area_modulo.createAndCount(filas);
    });
    // La API aplica el cambio ya, sin esperar a que venza la caché del área.
    this.permisosRol.invalidarArea(idArea);
    this.logger.log(`${actorId} dejó ${filas.length} módulo(s) habilitados en el área ${area.codigo} (id ${idArea})`);

    // La respuesta se arma después del commit.
    const { areas } = await this.matriz();
    const guardada = areas.find((a) => a.id === idArea);
    if (!guardada) throw areaNoEncontrada(idArea);
    return guardada;
  }
}
