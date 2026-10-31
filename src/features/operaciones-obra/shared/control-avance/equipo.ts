import { BadRequestException } from '@nestjs/common';
import type { OrmObra } from './orm.js';

/** Persona del equipo de la obra (un Anexo de tipo Trabajador). */
export interface PersonaObra {
  id: number;
  nombre: string;
}

export interface EquipoObra {
  jefe_proyecto: PersonaObra | null;
  coordinador: PersonaObra | null;
  residente: PersonaObra | null;
  resp_presupuesto: PersonaObra | null;
  resp_procura: PersonaObra | null;
}

export const ROLES_EQUIPO = ['jefe_proyecto', 'coordinador', 'residente', 'resp_presupuesto', 'resp_procura'] as const;
export type RolEquipo = (typeof ROLES_EQUIPO)[number];

export interface IdsEquipo {
  id_jefe_proyecto?: number | null;
  id_coordinador?: number | null;
  id_residente?: number | null;
  id_resp_presupuesto?: number | null;
  id_resp_procura?: number | null;
}

const nombreAnexo = (a: { Anexo: string | null; NombreComercial: string | null }) => a.Anexo ?? a.NombreComercial ?? '';

/** Arma el equipo de una ficha con los nombres ya conocidos (sin acceso a la BD). */
export function construirEquipo(ids: IdsEquipo | null | undefined, nombres: ReadonlyMap<number, string>): EquipoObra {
  const persona = (id: number | null | undefined): PersonaObra | null => (id == null ? null : { id, nombre: nombres.get(id) ?? `#${id}` });
  return {
    jefe_proyecto: persona(ids?.id_jefe_proyecto),
    coordinador: persona(ids?.id_coordinador),
    residente: persona(ids?.id_residente),
    resp_presupuesto: persona(ids?.id_resp_presupuesto),
    resp_procura: persona(ids?.id_resp_procura),
  };
}

/** Ids de personas distintos de una o varias fichas. */
export function idsDeEquipo(fichas: readonly (IdsEquipo | null | undefined)[]): number[] {
  const ids = new Set<number>();
  for (const f of fichas) {
    for (const v of [f?.id_jefe_proyecto, f?.id_coordinador, f?.id_residente, f?.id_resp_presupuesto, f?.id_resp_procura]) if (v != null) ids.add(v);
  }
  return [...ids];
}

/** Nombre de cada anexo pedido (una sola consulta). */
export async function nombresDeAnexos(orm: OrmObra, ids: readonly number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const anexos = await orm.Anexos.where((a) => a.id.in([...ids])).all();
  return new Map(anexos.map((a) => [a.id, nombreAnexo(a)]));
}

/** Nombres del equipo de una ficha. */
export async function cargarEquipo(orm: OrmObra, ids: IdsEquipo | null | undefined): Promise<EquipoObra> {
  return construirEquipo(ids, await nombresDeAnexos(orm, idsDeEquipo([ids])));
}

/** D15: el equipo sale del maestro de Anexos, solo Trabajadores activos. 400 si alguien no cumple. */
export async function validarEquipo(orm: OrmObra, ids: IdsEquipo): Promise<void> {
  const pedidos = Object.entries(ids).filter((e): e is [string, number] => typeof e[1] === 'number');
  for (const [campo, id] of pedidos) {
    const a = await orm.Anexos.first({ id });
    if (!a) throw new BadRequestException(`${campo}: el anexo ${id} no existe`);
    if (a.tipoAnexo !== 'Trabajador') throw new BadRequestException(`${campo}: «${nombreAnexo(a)}» no es un anexo de tipo Trabajador`);
    if (!a.estado) throw new BadRequestException(`${campo}: «${nombreAnexo(a)}» está inactivo`);
  }
}
