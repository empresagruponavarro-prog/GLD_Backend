import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import type { Database } from '../../../prisma/prisma.module.js';
import { nombresDeAnexos, ROLES_EQUIPO, type IdsEquipo, type RolEquipo } from '../shared/control-avance/equipo.js';
import type { OrmObra } from '../shared/control-avance/orm.js';
import { readDateOnly, toDateOnly, whatsappUrl } from '../shared/obra-shared.js';
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
    ...(r.fecha_alta ? { fecha_alta: readDateOnly(r.fecha_alta) } : {}),
    ...(r.fecha_baja ? { fecha_baja: readDateOnly(r.fecha_baja) } : {}),
  };
}

/** Filas que registran la ocupación de un rol del equipo (alta y baja): no son datos de obra ni contactos a mano. */
const esRegistroDeRol = (f: ResidenteRow) => f.rol_equipo != null;

/**
 * Directorio de la obra (sin BD): primero el equipo de la ficha, que no se escribe dos veces, y luego los contactos
 * agregados a mano. Hay **una tarjeta por persona y rol** (GRP S-06): quien tiene dos roles aparece dos veces, con los mismos
 * datos de contacto. La fila del directorio de una persona del equipo (si la hay) solo aporta sus datos de obra:
 * teléfono y correo de obra (con prioridad sobre los de Trabajadores), especialidad, turno, estado y foto.
 * Los registros de alta y baja de un rol (`rol_equipo`) no cuentan como datos ni como contactos: solo dan el «desde».
 */
export function armarDirectorio(
  ficha: IdsEquipo | null | undefined,
  contactos: ReadonlyMap<number, ContactoTrabajador>,
  filas: readonly ResidenteRow[],
): ObraResidenteDto[] {
  const usadas = new Set<number>();
  const equipo: ObraResidenteDto[] = [];
  for (const rol of ROLES_EQUIPO) {
    const idAnexo = ficha?.[CAMPO_ROL[rol]];
    if (idAnexo == null) continue;
    const fila = filas.find((f) => f.id_anexo === idAnexo && !esRegistroDeRol(f));
    if (fila) usadas.add(fila.id);
    const alta = filas.find((f) => esRegistroDeRol(f) && f.activo && f.rol_equipo === rol && f.id_anexo === idAnexo)?.fecha_alta;
    const contacto = contactos.get(idAnexo);
    const telefono = fila?.telefono || contacto?.telefono || undefined;
    equipo.push({
      id: fila?.id ?? null,
      clave: `equipo-${idAnexo}-${rol}`,
      origen: 'equipo',
      roles_equipo: [rol],
      id_anexo: idAnexo,
      nombre_completo: contacto?.nombre || fila?.nombre_completo || `#${idAnexo}`,
      rol_obra: ETIQUETAS_ROL[rol],
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
      ...(alta ? { fecha_alta: readDateOnly(alta) } : {}),
    });
  }
  const otros = filas.filter((f) => !usadas.has(f.id) && f.rol_obra !== ROL_COMPLEMENTO_EQUIPO && !esRegistroDeRol(f)).map(mapResidente);
  return [...equipo, ...otros];
}

/** Historial del equipo: quienes dejaron de ocupar un rol, del más reciente al más antiguo. */
export function armarHistorial(filas: readonly ResidenteRow[]): ObraResidenteDto[] {
  return filas
    .filter((f) => esRegistroDeRol(f) && !f.activo)
    .sort((a, b) => readDateOnly(b.fecha_baja).localeCompare(readDateOnly(a.fecha_baja)) || b.id - a.id)
    .map((f) => ({ ...mapResidente(f), clave: `hist-${f.id}`, origen: 'historial' as const }));
}

export interface CambioRol {
  rol: RolEquipo;
  idAnexo: number;
}

/** Qué roles cambian de persona: a quién se da de baja y a quién de alta. Puro. */
export function planificarCambiosEquipo(
  antes: IdsEquipo | null | undefined,
  despues: IdsEquipo | null | undefined,
): { cerrar: CambioRol[]; abrir: CambioRol[] } {
  const cerrar: CambioRol[] = [];
  const abrir: CambioRol[] = [];
  for (const rol of ROLES_EQUIPO) {
    const a = antes?.[CAMPO_ROL[rol]] ?? null;
    const d = despues?.[CAMPO_ROL[rol]] ?? null;
    if (a === d) continue;
    if (a != null) cerrar.push({ rol, idAnexo: a });
    if (d != null) abrir.push({ rol, idAnexo: d });
  }
  return { cerrar, abrir };
}

/**
 * Registra en el directorio los cambios del equipo de la ficha (GRP S-06): al salir una persona de un rol se cierra su
 * registro (`activo = false`, `fecha_baja`) y al entrar otra se abre uno nuevo con su `fecha_alta`. Nada se borra. Se
 * llama con `tx.orm.public` para quedar en la misma transacción que el cambio de la ficha.
 */
export async function sincronizarEquipo(
  orm: OrmObra,
  idCentroCosto: number,
  antes: IdsEquipo | null | undefined,
  despues: IdsEquipo | null | undefined,
  hoy: string,
): Promise<void> {
  const { cerrar, abrir } = planificarCambiosEquipo(antes, despues);
  if (cerrar.length === 0 && abrir.length === 0) return;
  const nombres = await nombresDeAnexos(orm, [...cerrar, ...abrir].map((c) => c.idAnexo));
  const nombre = (id: number) => toVarchar<200>((nombres.get(id) || `#${id}`).slice(0, 200));

  for (const c of cerrar) {
    const vigente = await orm.obra_residentes.first({ id_centro_costo: idCentroCosto, rol_equipo: toVarchar<30>(c.rol), id_anexo: c.idAnexo, activo: true });
    if (vigente) {
      await orm.obra_residentes.where({ id: vigente.id }).update({ activo: false, fecha_baja: toDateOnly(hoy)!, estado_planta: toVarchar<50>('Retirado') });
    } else {
      // Sin alta registrada (datos anteriores a esta regla): se deja constancia de la baja con alta desconocida.
      await orm.obra_residentes.create({
        id_centro_costo: idCentroCosto,
        id_anexo: c.idAnexo,
        nombre_completo: nombre(c.idAnexo),
        rol_obra: toVarchar<100>(ETIQUETAS_ROL[c.rol]),
        rol_equipo: toVarchar<30>(c.rol),
        activo: false,
        fecha_baja: toDateOnly(hoy)!,
        estado_planta: toVarchar<50>('Retirado'),
        orden: 0,
      });
    }
  }
  for (const c of abrir) {
    await orm.obra_residentes.create({
      id_centro_costo: idCentroCosto,
      id_anexo: c.idAnexo,
      nombre_completo: nombre(c.idAnexo),
      rol_obra: toVarchar<100>(ETIQUETAS_ROL[c.rol]),
      rol_equipo: toVarchar<30>(c.rol),
      activo: true,
      fecha_alta: toDateOnly(hoy)!,
      orden: 0,
    });
  }
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

/** Historial del equipo de una obra leído de la BD. */
export async function cargarHistorialEquipo(orm: OrmObra, idCentroCosto: number): Promise<ObraResidenteDto[]> {
  return armarHistorial(await orm.obra_residentes.where({ id_centro_costo: idCentroCosto, activo: false }).all());
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
