import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import type { Database } from '../../../prisma/prisma.module.js';

type Orm = Database['orm']['public'];

/** Ubicación completa de un distrito: códigos ubigeo INEI y los nombres de los tres niveles. */
export interface Ubicacion {
  id_distrito: string;
  id_provincia: string;
  id_departamento: string;
  departamento: string;
  provincia: string;
  distrito: string;
  /** Centro del distrito. */
  latitud?: number;
  longitud?: number;
}

/** Decimal de la BD (llega como texto) a número; `undefined` si no hay valor. */
export function aNumero(valor: unknown): number | undefined {
  if (valor === null || valor === undefined || valor === '') return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/** Ubicaciones de los distritos pedidos (tres consultas). Los códigos que no existan no aparecen en el mapa. */
export async function ubicacionesDe(orm: Orm, idsDistrito: readonly (string | null | undefined)[]): Promise<Map<string, Ubicacion>> {
  const ids = [...new Set(idsDistrito.filter((v): v is string => !!v))].map((v) => toVarchar<6>(v));
  if (ids.length === 0) return new Map();
  const distritos = await orm.distrito.where((d) => d.id.in(ids)).all();
  const idsProv = [...new Set(distritos.map((d) => d.id_provincia))];
  const provincias = idsProv.length ? await orm.provincia.where((p) => p.id.in(idsProv)).all() : [];
  const idsDep = [...new Set(provincias.map((p) => p.id_departamento))];
  const departamentos = idsDep.length ? await orm.departamento.where((d) => d.id.in(idsDep)).all() : [];
  const prov = new Map(provincias.map((p) => [p.id, p]));
  const dep = new Map(departamentos.map((d) => [d.id, d]));
  const res = new Map<string, Ubicacion>();
  for (const d of distritos) {
    const p = prov.get(d.id_provincia);
    const dp = p ? dep.get(p.id_departamento) : undefined;
    if (!p || !dp) continue;
    res.set(d.id, {
      id_distrito: d.id,
      id_provincia: p.id,
      id_departamento: dp.id,
      departamento: dp.nombre,
      provincia: p.nombre,
      distrito: d.nombre,
      latitud: aNumero(d.latitud),
      longitud: aNumero(d.longitud),
    });
  }
  return res;
}

/** Ubicación de un solo distrito, o `null` si el código no existe. */
export async function ubicacionDe(orm: Orm, idDistrito: string | null | undefined): Promise<Ubicacion | null> {
  if (!idDistrito) return null;
  return (await ubicacionesDe(orm, [idDistrito])).get(idDistrito) ?? null;
}
