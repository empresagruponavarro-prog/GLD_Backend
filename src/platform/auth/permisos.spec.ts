import { readFileSync } from 'node:fs';
import {
  ACCIONES,
  CLAVES_MODULO,
  MODULOS_ADMINISTRACION,
  MODULOS_ADMITEN_ANULAR,
  MODULOS_ADMITEN_APROBAR,
  SIN_PERMISOS,
  esAccion,
  esClaveModulo,
  moduloAdmiteAccion,
  MODULOS_SIN_FILTRO_DE_AREA,
  aplicarNivelArea,
  detallePermisosModulo,
  esModuloAdministracion,
  esModuloSinFiltroDeArea,
  nivelDeArea,
  permisosAdministrador,
  permisosEfectivos,
  type ModulosDeArea,
} from './permisos.js';

const OPS_JSON = new URL(
  '../../../migrations/app/20261015T1659_roles_permisos/ops.json',
  import.meta.url,
);

interface Operacion {
  id: string;
  execute: { sql: string }[];
}

/** SQL de una operación de la migración, leído del `ops.json` canónico (lo que se aplica). */
function sqlDe(id: string): string {
  const ops: Operacion[] = JSON.parse(readFileSync(OPS_JSON, 'utf8'));
  const op = ops.find((o) => o.id === id);
  if (!op) throw new Error(`No existe la operación ${id}`);
  return op.execute.map((e) => e.sql).join('\n');
}

/** Filas de la semilla: ('clave', 'nombre', 'grupo', 'ruta', orden, aprobar, anular). */
function semillaModulos() {
  const patron = /\('((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', (\d+), (true|false), (true|false)\)/g;
  return [...sqlDe('data.modulo.semilla').matchAll(patron)].map((m) => ({
    clave: m[1],
    nombre: m[2],
    grupo: m[3],
    ruta: m[4],
    orden: Number(m[5]),
    aprobar: m[6] === 'true',
    anular: m[7] === 'true',
  }));
}

describe('CLAVES_MODULO vs semilla de la tabla modulo', () => {
  const semilla = semillaModulos();

  it('la semilla trae los 33 módulos de CLAVES_MODULO, en el mismo orden y con orden 1..33', () => {
    expect(CLAVES_MODULO).toHaveLength(33);
    expect(semilla.map((m) => m.clave)).toEqual([...CLAVES_MODULO]);
    expect(semilla.map((m) => m.orden)).toEqual(CLAVES_MODULO.map((_c, i) => i + 1));
    expect(new Set(CLAVES_MODULO).size).toBe(CLAVES_MODULO.length);
  });

  it('la semilla es idempotente', () => {
    expect(sqlDe('data.modulo.semilla')).toMatch(/ON CONFLICT \(clave\) DO NOTHING$/);
    expect(sqlDe('data.rol_permiso.semilla')).toMatch(/ON CONFLICT \(rol_id, modulo_id\) DO NOTHING$/);
  });

  it('aprobar/anular según el plan §5', () => {
    const conAprobar = semilla.filter((m) => m.aprobar).map((m) => m.clave);
    const conAnular = semilla.filter((m) => m.anular).map((m) => m.clave);
    expect(conAprobar).toEqual(['documentos.administracion', 'requerimientos.aprobacion']);
    expect(conAnular).toEqual([
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
    ]);
  });

  it('grupos en el orden del catálogo y Administración = admin.*', () => {
    expect([...new Set(semilla.map((m) => m.grupo))]).toEqual([
      'Navegación',
      'Operaciones',
      'Documentos',
      'Tesorería',
      'Almacén',
      'Maestros',
      'Proyectos',
      'Administración',
    ]);
    expect(semilla.filter((m) => m.grupo === 'Administración').map((m) => m.clave)).toEqual([
      'admin.empresas',
      'admin.usuarios',
      'admin.roles',
    ]);
    expect(semilla.find((m) => m.clave === 'obra')?.ruta).toBe('/centros-costos/:id/datos');
  });

  it('MODULOS_ADMITEN_APROBAR/ANULAR y MODULOS_ADMINISTRACION coinciden con la semilla', () => {
    expect([...MODULOS_ADMITEN_APROBAR]).toEqual(semilla.filter((m) => m.aprobar).map((m) => m.clave));
    expect([...MODULOS_ADMITEN_ANULAR]).toEqual(semilla.filter((m) => m.anular).map((m) => m.clave));
    expect([...MODULOS_ADMINISTRACION]).toEqual(
      semilla.filter((m) => m.grupo === 'Administración').map((m) => m.clave),
    );
  });

  it('D5: los roles que no son de sistema reciben todo salvo Administración', () => {
    const sql = sqlDe('data.rol_permiso.semilla');
    expect(sql).toContain('r.es_sistema = false');
    expect(sql).toContain("m.grupo <> 'Administración'");
    expect(sql).toContain('true, true, true, true, m.admite_aprobar, m.admite_anular');
  });
});

describe('permisos (tipos y reglas)', () => {
  const ambos = { admite_aprobar: true, admite_anular: true };
  const ninguno = { admite_aprobar: false, admite_anular: false };
  const todo = { ver: true, crear: true, editar: true, eliminar: true, aprobar: true, anular: true };

  it('acciones y claves', () => {
    expect(ACCIONES).toEqual(['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'anular']);
    expect(esClaveModulo('tesoreria.pagos')).toBe(true);
    expect(esClaveModulo('tesoreria')).toBe(false);
    expect(esAccion('anular')).toBe(true);
    expect(esAccion('borrar')).toBe(false);
  });

  it('moduloAdmiteAccion: las 4 básicas siempre; aprobar/anular según la semilla', () => {
    expect(moduloAdmiteAccion('maestros.areas', 'eliminar')).toBe(true);
    expect(moduloAdmiteAccion('requerimientos.aprobacion', 'aprobar')).toBe(true);
    expect(moduloAdmiteAccion('requerimientos', 'aprobar')).toBe(false);
    expect(moduloAdmiteAccion('tesoreria.pagos', 'anular')).toBe(true);
    expect(moduloAdmiteAccion('tesoreria.cuentas', 'anular')).toBe(false);
  });

  it('Administrador: todo, aprobar/anular solo donde el módulo lo admite', () => {
    expect(permisosAdministrador(ambos)).toEqual(todo);
    expect(permisosAdministrador(ninguno)).toEqual({ ...todo, aprobar: false, anular: false });
    expect(permisosEfectivos(ninguno, true, undefined)).toEqual({ ...todo, aprobar: false, anular: false });
  });

  it('rol normal: su fila (recortada a lo que admite el módulo); sin fila, nada', () => {
    expect(permisosEfectivos(ambos, false, undefined)).toEqual(SIN_PERMISOS);
    expect(permisosEfectivos(ninguno, false, todo)).toEqual({ ...todo, aprobar: false, anular: false });
    expect(permisosEfectivos(ambos, false, { ...todo, eliminar: false })).toEqual({ ...todo, eliminar: false });
    expect(Object.isFrozen(SIN_PERMISOS)).toBe(true);
  });
});

describe('permisos efectivos de una persona (plan 08)', () => {
  const rol = { ver: true, crear: true, editar: true, eliminar: false, aprobar: false, anular: false };
  const pagos = { id: 10, clave: 'tesoreria.pagos', admite_aprobar: false, admite_anular: true };
  const area = (...filas: [number, boolean][]): ModulosDeArea => new Map(filas.map(([id, solo_lectura]) => [id, { solo_lectura }]));

  it('los módulos que no dependen del área son los de Administración y el menú de módulos', () => {
    expect([...MODULOS_SIN_FILTRO_DE_AREA].sort()).toEqual([...MODULOS_ADMINISTRACION, 'modulos'].sort());
    expect(esModuloSinFiltroDeArea('modulos')).toBe(true);
    expect(esModuloSinFiltroDeArea('tesoreria.pagos')).toBe(false);
    expect(esModuloAdministracion('admin.roles')).toBe(true);
    expect(esModuloAdministracion('modulos')).toBe(false);
  });

  it('nivelDeArea y aplicarNivelArea: sin fila no hay nada, solo ver deja únicamente Ver, completo deja el rol', () => {
    expect(nivelDeArea(undefined)).toBe('no');
    expect(nivelDeArea({ solo_lectura: true })).toBe('solo_ver');
    expect(nivelDeArea({ solo_lectura: false })).toBe('completo');
    expect(aplicarNivelArea(rol, 'no')).toEqual(SIN_PERMISOS);
    expect(aplicarNivelArea(rol, 'solo_ver')).toEqual({ ...SIN_PERMISOS, ver: true });
    expect(aplicarNivelArea({ ...rol, ver: false }, 'solo_ver')).toEqual(SIN_PERMISOS); // el área no da Ver si el rol no lo da
    expect(aplicarNivelArea(rol, 'completo')).toBe(rol);
  });

  it('sin área configurada (null) y sin excepción: queda el rol y el origen es el rol', () => {
    const d = detallePermisosModulo({ modulo: pagos, rol, area: null, excepcion: undefined });
    expect(d).toEqual({ rol, area: 'sin_restriccion', tras_area: rol, efectivo: rol, origen: 'rol' });
  });

  it('el área recorta y el origen pasa a ser el área solo si de verdad cambió algo', () => {
    expect(detallePermisosModulo({ modulo: pagos, rol, area: area([11, false]), excepcion: undefined })).toMatchObject({
      area: 'no',
      efectivo: SIN_PERMISOS,
      origen: 'area',
    });
    expect(detallePermisosModulo({ modulo: pagos, rol, area: area([10, true]), excepcion: undefined })).toMatchObject({
      area: 'solo_ver',
      efectivo: { ...SIN_PERMISOS, ver: true },
      origen: 'area',
    });
    // Completo no cambia nada: el origen sigue siendo el rol.
    expect(detallePermisosModulo({ modulo: pagos, rol, area: area([10, false]), excepcion: undefined })).toMatchObject({
      area: 'completo',
      efectivo: rol,
      origen: 'rol',
    });
    // Un rol que ya solo ve, en un área de solo lectura: tampoco hay cambio.
    const soloVer = { ...SIN_PERMISOS, ver: true };
    expect(detallePermisosModulo({ modulo: pagos, rol: soloVer, area: area([10, true]), excepcion: undefined }).origen).toBe('rol');
  });

  it('la excepción reemplaza el módulo (gana al rol y al área) y se recorta a lo que admite el módulo', () => {
    const exc = { ver: true, crear: false, editar: false, eliminar: true, aprobar: true, anular: true };
    const d = detallePermisosModulo({ modulo: pagos, rol, area: area([11, false]), excepcion: exc });
    expect(d.origen).toBe('excepcion');
    expect(d.tras_area).toEqual(SIN_PERMISOS);
    expect(d.efectivo).toEqual({ ver: true, crear: false, editar: false, eliminar: true, aprobar: false, anular: true });
  });

  it('las excepciones nunca valen en Administración y el área no la filtra', () => {
    const admin = { id: 32, clave: 'admin.usuarios', admite_aprobar: false, admite_anular: false };
    const todo = { ver: true, crear: true, editar: true, eliminar: true, aprobar: false, anular: false };
    const d = detallePermisosModulo({ modulo: admin, rol: SIN_PERMISOS, area: area([10, false]), excepcion: todo });
    expect(d).toMatchObject({ area: 'sin_restriccion', efectivo: SIN_PERMISOS, origen: 'rol' });
  });
});
