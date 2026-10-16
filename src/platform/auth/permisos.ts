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
