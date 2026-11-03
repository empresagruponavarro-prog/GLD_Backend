import type { Database } from '../../../prisma/prisma.module.js';
import { ROLES_EQUIPO, type IdsEquipo, type RolEquipo } from '../shared/control-avance/equipo.js';
import type { OrmObra } from '../shared/control-avance/orm.js';
import { whatsappUrl } from '../shared/obra-shared.js';
import type { ObraResidenteDto } from './residentes.dto.js';

export type ResidenteRow = NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_residentes']['first']>>>;

/** Cargo con que se muestra en el Directorio cada rol del equipo de la ficha. */
export const ETIQUETAS_ROL: Record<RolEquipo, string> = {
  jefe_proyecto: 'Jefe de proyecto',
  coordinador: 'Coordinador',
  residente: 'Residente',
  resp_presupuesto: 'Resp. presupuesto',
  resp_procura: 'Resp. procura',
};

/**
 * `rol_obra` de las filas que solo completan los datos (teléfono, turno…) de una persona del equipo de la ficha.
 * Si esa persona sale de la ficha, su fila deja de mostrarse en vez de quedar como un cargo que ya no tiene.
 */
export const ROL_COMPLEMENTO_EQUIPO = 'Equipo de la ficha';

/** Lo que el maestro de Trabajadores sabe de una persona: el contacto institucional antes que el personal. */
export interface ContactoTrabajador {
  nombre: string;
  telefono: string | null;
  correo: string | null;
}

const CAMPO_ROL: Record<RolEquipo, keyof IdsEquipo> = {
  jefe_proyecto: 'id_jefe_proyecto',
  coordinador: 'id_coordinador',
  residente: 'id_residente',
  resp_presupuesto: 'id_resp_presupuesto',
  resp_procura: 'id_resp_procura',
};

/** Personas del equipo de la ficha con sus roles (una persona puede tener varios), en el orden de la ficha. */
export function rolesPorPersona(ficha: IdsEquipo | null | undefined): Map<number, RolEquipo[]> {
  const personas = new Map<number, RolEquipo[]>();
  for (const rol of ROLES_EQUIPO) {
    const id = ficha?.[CAMPO_ROL[rol]];
    if (id == null) continue;
    personas.set(id, [...(personas.get(id) ?? []), rol]);
  }
  return personas;
}

export function mapResidente(r: ResidenteRow): ObraResidenteDto {
  return {
    id: r.id,
    clave: `res-${r.id}`,
    origen: 'directorio',
    id_anexo: r.id_anexo ?? undefined,
    nombre_completo: r.nombre_completo ?? '',
    rol_obra: r.rol_obra ?? '',
    especialidad: r.especialidad ?? undefined,
    telefono: r.telefono ?? undefined,
    correo: r.correo ?? undefined,
    turno: r.turno ?? undefined,
    estado_planta: r.estado_planta ?? 'En Planta',
    foto_url: r.foto_url ?? undefined,
    orden: r.orden ?? 0,
    whatsapp_url: whatsappUrl(r.telefono),
  };
}

/**
 * Directorio de la obra (sin BD): primero el equipo de la ficha, que no se escribe dos veces, y luego los contactos
 * agregados a mano. La fila del directorio de una persona del equipo (si la hay) solo aporta sus datos de obra:
 * teléfono y correo de obra (con prioridad sobre los de Trabajadores), especialidad, turno, estado y foto.
 */
export function armarDirectorio(
  ficha: IdsEquipo | null | undefined,
  contactos: ReadonlyMap<number, ContactoTrabajador>,
  filas: readonly ResidenteRow[],
): ObraResidenteDto[] {
  const personas = rolesPorPersona(ficha);
  const usadas = new Set<number>();
  const equipo: ObraResidenteDto[] = [];
  for (const [idAnexo, roles] of personas) {
    const fila = filas.find((f) => f.id_anexo === idAnexo);
    if (fila) usadas.add(fila.id);
    const contacto = contactos.get(idAnexo);
    const telefono = fila?.telefono || contacto?.telefono || undefined;
    equipo.push({
      id: fila?.id ?? null,
      clave: `equipo-${idAnexo}`,
      origen: 'equipo',
      roles_equipo: roles,
      id_anexo: idAnexo,
      nombre_completo: contacto?.nombre || fila?.nombre_completo || `#${idAnexo}`,
      rol_obra: roles.map((r) => ETIQUETAS_ROL[r]).join(' · '),
      especialidad: fila?.especialidad ?? undefined,
      telefono,
      correo: fila?.correo || contacto?.correo || undefined,
      telefono_obra: fila?.telefono ?? undefined,
      correo_obra: fila?.correo ?? undefined,
      telefono_trabajador: contacto?.telefono ?? undefined,
      correo_trabajador: contacto?.correo ?? undefined,
      turno: fila?.turno ?? undefined,
      estado_planta: fila?.estado_planta ?? 'En Planta',
      foto_url: fila?.foto_url ?? undefined,
      orden: 0,
      whatsapp_url: whatsappUrl(telefono),
    });
  }
  const otros = filas.filter((f) => !usadas.has(f.id) && f.rol_obra !== ROL_COMPLEMENTO_EQUIPO).map(mapResidente);
  return [...equipo, ...otros];
}

/** Nombre y contacto de cada persona pedida, desde Anexos y su ficha de RR.HH. (dos consultas). */
export async function contactosDeTrabajadores(orm: OrmObra, ids: readonly number[]): Promise<Map<number, ContactoTrabajador>> {
  if (ids.length === 0) return new Map();
  const [anexos, fichas] = await Promise.all([
    orm.Anexos.where((a) => a.id.in([...ids])).all(),
    orm.trabajador.where((t) => t.id_anexo.in([...ids])).all(),
  ]);
  const porAnexo = new Map(fichas.map((t) => [t.id_anexo, t]));
  return new Map(
    anexos.map((a) => {
      const t = porAnexo.get(a.id);
      return [
        a.id,
        {
          nombre: a.Anexo ?? a.NombreComercial ?? '',
          telefono: t?.telefono_institucional || a.Telefono || null,
          correo: t?.correo_institucional || a.Correo || null,
        },
      ];
    }),
  );
}

/** Directorio de una obra leído de la BD. */
export async function cargarDirectorio(orm: OrmObra, idCentroCosto: number): Promise<ObraResidenteDto[]> {
  const [ficha, filas] = await Promise.all([
    orm.obra_datos_generales.first({ id_centro_costo: idCentroCosto }),
    orm.obra_residentes.where({ id_centro_costo: idCentroCosto }).orderBy((r) => r.orden.asc()).all(),
  ]);
  const contactos = await contactosDeTrabajadores(orm, [...rolesPorPersona(ficha).keys()]);
  return armarDirectorio(ficha, contactos, filas);
}
