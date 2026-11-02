import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { ActualizarOpcionDto, Catalogo, CrearOpcionDto, OpcionResponseDto } from './catalogo.dto.js';

type Fila = { id: number; nombre: Varchar<80>; activo: boolean; orden: number };
type Cambios = Partial<{ nombre: Varchar<80>; activo: boolean; orden: number }>;

/** Lo que el handler necesita de cada tabla de catálogo (las dos tienen la misma forma). */
interface Tabla {
  /** Nombre de la opción en singular, para los mensajes. */
  readonly etiqueta: string;
  todas(): Promise<readonly Fila[]>;
  porId(id: number): Promise<Fila | null>;
  crear(nombre: Varchar<80>, orden: number): Promise<Fila>;
  actualizar(id: number, cambios: Cambios): Promise<Fila | null>;
  eliminar(id: number): Promise<void>;
  /** Trabajadores que tienen esta opción en su ficha. */
  usos(): Promise<Map<number, number>>;
}

/**
 * Catálogos de RR.HH. (tipos de trabajador y modalidades de contrato). Una opción en uso no se elimina: se
 * desactiva, y quien ya la tenía la conserva.
 */
@Injectable()
export class CatalogoHandler {
  private readonly tablas: Readonly<Record<Catalogo, Tabla>>;

  constructor(@Inject(DB) private readonly db: Database) {
    const orm = this.db.orm.public;
    const contar = (ids: readonly (number | null)[]) => {
      const mapa = new Map<number, number>();
      for (const id of ids) if (id !== null) mapa.set(id, (mapa.get(id) ?? 0) + 1);
      return mapa;
    };
    this.tablas = {
      'tipos-trabajador': {
        etiqueta: 'tipo de trabajador',
        todas: async () => await orm.rrhh_tipo_trabajador.orderBy((t) => t.orden.asc()).all(),
        porId: (id) => orm.rrhh_tipo_trabajador.first({ id }),
        crear: (nombre, orden) => orm.rrhh_tipo_trabajador.create({ nombre, orden }),
        actualizar: (id, cambios) => orm.rrhh_tipo_trabajador.where({ id }).update(cambios),
        eliminar: async (id) => {
          await orm.rrhh_tipo_trabajador.where({ id }).delete();
        },
        usos: async () => contar((await orm.trabajador.all()).map((t) => t.id_tipo_trabajador)),
      },
      'modalidades-contrato': {
        etiqueta: 'modalidad de contrato',
        todas: async () => await orm.rrhh_modalidad_contrato.orderBy((m) => m.orden.asc()).all(),
        porId: (id) => orm.rrhh_modalidad_contrato.first({ id }),
        crear: (nombre, orden) => orm.rrhh_modalidad_contrato.create({ nombre, orden }),
        actualizar: (id, cambios) => orm.rrhh_modalidad_contrato.where({ id }).update(cambios),
        eliminar: async (id) => {
          await orm.rrhh_modalidad_contrato.where({ id }).delete();
        },
        usos: async () => contar((await orm.trabajador.all()).map((t) => t.id_modalidad_contrato)),
      },
    };
  }

  async listar(catalogo: Catalogo): Promise<OpcionResponseDto[]> {
    const tabla = this.tablas[catalogo];
    const [filas, usos] = await Promise.all([tabla.todas(), tabla.usos()]);
    return filas.map((f) => respuesta(f, usos.get(f.id) ?? 0));
  }

  async crear(catalogo: Catalogo, dto: CrearOpcionDto): Promise<OpcionResponseDto> {
    const tabla = this.tablas[catalogo];
    const nombre = normalizar(dto.nombre, tabla);
    const filas = await tabla.todas();
    noRepetido(filas, nombre, null, tabla);
    const orden = Math.max(0, ...filas.map((f) => f.orden)) + 1;
    return respuesta(await tabla.crear(toVarchar<80>(nombre), orden), 0);
  }

  async actualizar(catalogo: Catalogo, id: number, dto: ActualizarOpcionDto): Promise<OpcionResponseDto> {
    const tabla = this.tablas[catalogo];
    await this.existente(tabla, id);
    const cambios: Cambios = {};
    if (dto.nombre !== undefined) {
      const nombre = normalizar(dto.nombre, tabla);
      noRepetido(await tabla.todas(), nombre, id, tabla);
      cambios.nombre = toVarchar<80>(nombre);
    }
    if (dto.activo !== undefined) cambios.activo = dto.activo;
    if (Object.keys(cambios).length > 0) await tabla.actualizar(id, cambios);
    return this.una(catalogo, id);
  }

  /** Sube o baja una posición: intercambia el orden con la vecina. */
  async mover(catalogo: Catalogo, id: number, direccion: 'arriba' | 'abajo'): Promise<OpcionResponseDto[]> {
    const tabla = this.tablas[catalogo];
    await this.existente(tabla, id);
    const filas = [...(await tabla.todas())];
    const i = filas.findIndex((f) => f.id === id);
    const j = direccion === 'arriba' ? i - 1 : i + 1;
    const actual = filas[i];
    const vecina = filas[j];
    if (actual && vecina) {
      // Si tenían el mismo orden (datos antiguos), se separan para que el cambio se note.
      const ordenActual = actual.orden === vecina.orden ? (direccion === 'arriba' ? vecina.orden - 1 : vecina.orden + 1) : vecina.orden;
      await tabla.actualizar(actual.id, { orden: ordenActual });
      await tabla.actualizar(vecina.id, { orden: actual.orden });
    }
    return this.listar(catalogo);
  }

  async eliminar(catalogo: Catalogo, id: number): Promise<void> {
    const tabla = this.tablas[catalogo];
    await this.existente(tabla, id);
    const usos = (await tabla.usos()).get(id) ?? 0;
    if (usos > 0) {
      throw new ConflictException(`No se puede eliminar: ${usos} trabajador(es) tienen esta ${tabla.etiqueta}. Desactívala en su lugar.`);
    }
    await tabla.eliminar(id);
  }

  private async una(catalogo: Catalogo, id: number): Promise<OpcionResponseDto> {
    const opcion = (await this.listar(catalogo)).find((o) => o.id === id);
    if (!opcion) throw new NotFoundException('La opción no existe');
    return opcion;
  }

  private async existente(tabla: Tabla, id: number): Promise<Fila> {
    const fila = await tabla.porId(id);
    if (!fila) throw new NotFoundException(`No existe esa ${tabla.etiqueta}`);
    return fila;
  }
}

/** Sin espacios sobrantes y en mayúsculas, como el resto de las opciones. */
function normalizar(nombre: string, tabla: Tabla): string {
  const limpio = nombre.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es');
  if (!limpio) throw new BadRequestException(`Escribe el nombre de la ${tabla.etiqueta}`);
  return limpio;
}

function noRepetido(filas: readonly Fila[], nombre: string, excluirId: number | null, tabla: Tabla): void {
  const igual = filas.find((f) => f.id !== excluirId && String(f.nombre).toLocaleUpperCase('es') === nombre);
  if (igual) throw new ConflictException(`Ya existe la ${tabla.etiqueta} «${nombre}»`);
}

function respuesta(f: Fila, usos: number): OpcionResponseDto {
  return { id: f.id, nombre: String(f.nombre), activo: f.activo, orden: f.orden, usos };
}
