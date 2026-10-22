/**
 * Catálogo de módulos y acciones (plan 05-roles-y-permisos §5-§6). Los tipos son idénticos en el
 * frontend. `CLAVES_MODULO` debe coincidir, en el mismo orden, con la semilla de la tabla `modulo`
 * (migración `20261015T1659_roles_permisos`); lo verifica `permisos.spec.ts`.
 */
export const CLAVES_MODULO = [
  'dashboard',
  'modulos',
  'incidencias',
  'documentos.administracion',
  'documentos.origen',
  'requerimientos',
  'requerimientos.aprobacion',
  'tesoreria.consulta',
  'tesoreria.programacion',
  'tesoreria.pagos',
  'tesoreria.cuentas',
  'tesoreria.tipo-cambio',
  'almacen.consulta',
  'almacen.stock',
  'almacen.recepciones',
  'almacen.ingresos',
  'almacen.salidas',
  'almacen.transferencias',
  'almacen.prestamos',
  'almacen.kardex',
  'almacen.inventario-inicial',
  'almacen.almacenes',
  'maestros.anexos',
  'maestros.productos',
  'maestros.areas',
  'maestros.generales',
  'centros-costos',
  'obra',
  'presupuestos',
  'presupuestos.plantillas',
  'admin.empresas',
  'admin.usuarios',
  'admin.roles',
] as const;

export type ClaveModulo = (typeof CLAVES_MODULO)[number];

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'anular'] as const;

export type Accion = (typeof ACCIONES)[number];

export type Permisos = Readonly<Record<Accion, boolean>>;

const CLAVES = new Set<string>(CLAVES_MODULO);

export function esClaveModulo(valor: string): valor is ClaveModulo {
  return CLAVES.has(valor);
}

/** Lo que un módulo admite además de las 4 acciones básicas. */
export interface ModuloAcciones {
  admite_aprobar: boolean;
  admite_anular: boolean;
}

export const SIN_PERMISOS: Permisos = Object.freeze({
  ver: false,
  crear: false,
  editar: false,
  eliminar: false,
  aprobar: false,
  anular: false,
});

/** El Administrador (rol de sistema) tiene todo; aprobar/anular solo donde el módulo lo admite. */
export function permisosAdministrador(modulo: ModuloAcciones): Permisos {
  return {
    ver: true,
    crear: true,
    editar: true,
    eliminar: true,
    aprobar: modulo.admite_aprobar,
    anular: modulo.admite_anular,
  };
}

/**
 * Permisos efectivos de un rol en un módulo: el Administrador lo tiene todo; los demás, su fila
 * guardada (sin fila → todo denegado). Aprobar/anular se recortan a lo que el módulo admite.
 */
export function permisosEfectivos(
  modulo: ModuloAcciones,
  esAdministrador: boolean,
  fila: Readonly<Record<Accion, boolean>> | undefined,
): Permisos {
  if (esAdministrador) return permisosAdministrador(modulo);
  if (!fila) return SIN_PERMISOS;
  return {
    ver: fila.ver,
    crear: fila.crear,
    editar: fila.editar,
    eliminar: fila.eliminar,
    aprobar: fila.aprobar && modulo.admite_aprobar,
    anular: fila.anular && modulo.admite_anular,
  };
}

export function esAccion(valor: string): valor is Accion {
  return ACCIONES.some((a) => a === valor);
}

/**
 * Módulos que admiten Aprobar / Anular según la semilla de `modulo` (plan §5). Los usa el test de
 * cobertura de la API para validar `@Accion('aprobar' | 'anular')`; `permisos.spec.ts` comprueba
 * que coinciden con la migración.
 */
export const MODULOS_ADMITEN_APROBAR: readonly ClaveModulo[] = ['documentos.administracion', 'requerimientos.aprobacion'];

export const MODULOS_ADMITEN_ANULAR: readonly ClaveModulo[] = [
  'documentos.administracion',
  'documentos.origen',
  'tesoreria.programacion',
  'tesoreria.pagos',
  'almacen.recepciones',
  'almacen.ingresos',
  'almacen.salidas',
  'almacen.transferencias',
  'almacen.prestamos',
  'almacen.inventario-inicial',
];

/** ¿El módulo admite la acción? Las 4 básicas siempre; aprobar/anular según la semilla. */
export function moduloAdmiteAccion(clave: ClaveModulo, accion: Accion): boolean {
  if (accion === 'aprobar') return MODULOS_ADMITEN_APROBAR.includes(clave);
  if (accion === 'anular') return MODULOS_ADMITEN_ANULAR.includes(clave);
  return true;
}

/**
 * Grupo "Administración": en la API se aplica SIEMPRE en modo estricto, también en modo auditoría
 * (plan §7.2), porque antes de la etapa C ya estaba restringido al Administrador.
 */
export const MODULOS_ADMINISTRACION: readonly ClaveModulo[] = ['admin.empresas', 'admin.usuarios', 'admin.roles'];

// ---------------------------------------------------------------------------------------------
// Permisos efectivos de una PERSONA (plan 08): rol → filtro de área → excepciones del usuario.
// ---------------------------------------------------------------------------------------------

/**
 * Módulos que NO dependen del área: los de Administración y el menú de módulos (`modulos`).
 * Solo los gobierna el rol.
 */
export const MODULOS_SIN_FILTRO_DE_AREA: readonly ClaveModulo[] = [...MODULOS_ADMINISTRACION, 'modulos'];

export function esModuloSinFiltroDeArea(clave: string): boolean {
  return MODULOS_SIN_FILTRO_DE_AREA.some((c) => c === clave);
}

export function esModuloAdministracion(clave: string): boolean {
  return MODULOS_ADMINISTRACION.some((c) => c === clave);
}

/** Estado de un módulo en un área: sin fila (`no`), solo lectura o completo (rige el rol). */
export type NivelArea = 'no' | 'solo_ver' | 'completo';

/** Fila de `area_modulo`: el módulo está habilitado; `solo_lectura` limita al área a Ver. */
export interface AccesoArea {
  readonly solo_lectura: boolean;
}

/** Módulos habilitados de un área, por `modulo_id`. */
export type ModulosDeArea = ReadonlyMap<number, AccesoArea>;

export function nivelDeArea(acceso: AccesoArea | undefined): NivelArea {
  if (!acceso) return 'no';
  return acceso.solo_lectura ? 'solo_ver' : 'completo';
}

/** Recorta los permisos del rol según el nivel del módulo en el área. */
export function aplicarNivelArea(rol: Permisos, nivel: NivelArea): Permisos {
  if (nivel === 'no') return SIN_PERMISOS;
  if (nivel === 'solo_ver') return { ...SIN_PERMISOS, ver: rol.ver };
  return rol;
}

/** Datos del catálogo que hacen falta para combinar permisos de un módulo. */
export interface ModuloCatalogo extends ModuloAcciones {
  readonly id: number;
  readonly clave: string;
}

export type OrigenPermiso = 'rol' | 'area' | 'excepcion';

export interface EntradaDetallePermisos {
  modulo: ModuloCatalogo;
  /** Lo que da el rol en este módulo (ya recortado por `admite_aprobar`/`admite_anular`). */
  rol: Permisos;
  /** Módulos habilitados del área del usuario; `null` = sin área o área sin configurar (sin restricción). */
  area: ModulosDeArea | null;
  /** Fila de `usuario_permiso` del usuario en este módulo, si la tiene. */
  excepcion: Readonly<Record<Accion, boolean>> | undefined;
}

export interface DetallePermisosModulo {
  rol: Permisos;
  area: NivelArea | 'sin_restriccion';
  tras_area: Permisos;
  efectivo: Permisos;
  /** De dónde sale el resultado: la excepción gana a todo; si el área lo recortó, `area`; si no, `rol`. */
  origen: OrigenPermiso;
}

function mismosPermisos(a: Permisos, b: Permisos): boolean {
  return ACCIONES.every((accion) => a[accion] === b[accion]);
}

/**
 * Combina, para un módulo, lo que da el ROL con el filtro del ÁREA y las EXCEPCIONES del usuario:
 * 1. base = permisos del rol;
 * 2. si el usuario tiene área configurada y el módulo no es de Administración ni `modulos`, el área
 *    lo deja en `no` (sin fila), `solo_ver` o `completo`;
 * 3. una fila de excepción REEMPLAZA solo este módulo (concede o quita); nunca en Administración.
 * El Administrador no pasa por aquí (acceso total).
 */
export function detallePermisosModulo(entrada: EntradaDetallePermisos): DetallePermisosModulo {
  const { modulo, rol, area, excepcion } = entrada;
  const nivel: NivelArea | 'sin_restriccion' =
    area !== null && !esModuloSinFiltroDeArea(modulo.clave) ? nivelDeArea(area.get(modulo.id)) : 'sin_restriccion';
  const trasArea = nivel === 'sin_restriccion' ? rol : aplicarNivelArea(rol, nivel);
  const conExcepcion = excepcion !== undefined && !esModuloAdministracion(modulo.clave);
  const efectivo = conExcepcion ? permisosEfectivos(modulo, false, excepcion) : trasArea;
  let origen: OrigenPermiso = 'rol';
  if (conExcepcion) origen = 'excepcion';
  else if (!mismosPermisos(rol, trasArea)) origen = 'area';
  return { rol, area: nivel, tras_area: trasArea, efectivo, origen };
}
