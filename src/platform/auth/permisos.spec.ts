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
  permisosAdministrador,
  permisosEfectivos,
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
