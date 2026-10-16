import { RequestMethod } from '@nestjs/common';
import { CONTROLLER_WATERMARK, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AppModule } from '../../app.module.js';
import { esAccion, esClaveModulo, moduloAdmiteAccion } from './permisos.js';
import { ACCION_KEY, LECTURA_COMPARTIDA_KEY, MODULO_KEY, TAMBIEN_DESDE_KEY } from './permisos.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * C2 (plan 05 §7.3): NINGUNA ruta de la API queda sin clasificar. Recorre por reflexión los
 * controladores registrados en `AppModule` y, leyendo el árbol `src/**\/*.controller.ts`, también
 * los de módulos no importados (p. ej. `MenuModule`).
 */

type Clase = abstract new (...args: never[]) => unknown;

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function archivosController(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return archivosController(ruta);
    return e.name.endsWith('.controller.ts') ? [ruta] : [];
  });
}

function esControlador(valor: unknown): valor is Clase {
  return typeof valor === 'function' && Reflect.getMetadata(CONTROLLER_WATERMARK, valor) === true;
}

/** Controladores alcanzables desde un módulo (imports recursivos, incluidos los dinámicos). */
function controladoresRegistrados(raiz: unknown): Set<unknown> {
  const vistos = new Set<unknown>();
  const controladores = new Set<unknown>();
  const visitar = (modulo: unknown) => {
    if (!modulo || vistos.has(modulo)) return;
    vistos.add(modulo);
    if (typeof modulo === 'object' && 'module' in modulo) {
      for (const c of ('controllers' in modulo && Array.isArray(modulo.controllers) ? modulo.controllers : [])) {
        controladores.add(c);
      }
      for (const i of ('imports' in modulo && Array.isArray(modulo.imports) ? modulo.imports : [])) visitar(i);
      visitar(modulo.module);
      return;
    }
    if (typeof modulo !== 'function') return;
    const lista = (clave: string): unknown[] => {
      const v: unknown = Reflect.getMetadata(clave, modulo);
      return Array.isArray(v) ? v : [];
    };
    for (const c of lista(MODULE_METADATA.CONTROLLERS)) controladores.add(c);
    for (const i of lista(MODULE_METADATA.IMPORTS)) visitar(i);
  };
  visitar(raiz);
  return controladores;
}

interface Ruta {
  controlador: string;
  archivo: string;
  metodo: string;
  verbo: string;
  path: string;
  publico: boolean;
  compartida: boolean;
  modulo: string | undefined;
  accion: string | undefined;
  /** `@TambienDesde` crudo del método (`undefined` si no tiene). */
  tambienDesde: unknown;
}

const meta = (clave: string, objetivo: object): unknown => Reflect.getMetadata(clave, objetivo);

function rutasDe(clase: Clase, archivo: string): Ruta[] {
  const proto: Record<string, unknown> = clase.prototype;
  const moduloClase = meta(MODULO_KEY, clase);
  const base = String(meta(PATH_METADATA, clase) ?? '');
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor')
    .flatMap((n) => {
      const handler = proto[n];
      if (typeof handler !== 'function' || meta(PATH_METADATA, handler) === undefined) return [];
      const verbo = meta(METHOD_METADATA, handler);
      return [
        {
          controlador: clase.name,
          archivo,
          metodo: n,
          verbo: typeof verbo === 'number' ? RequestMethod[verbo] : String(verbo),
          path: `/${[base, String(meta(PATH_METADATA, handler))].join('/').split('/').filter(Boolean).join('/')}`,
          publico: meta(IS_PUBLIC_KEY, handler) === true || meta(IS_PUBLIC_KEY, clase) === true,
          compartida: meta(LECTURA_COMPARTIDA_KEY, handler) === true || meta(LECTURA_COMPARTIDA_KEY, clase) === true,
          modulo: typeof moduloClase === 'string' ? moduloClase : undefined,
          accion: typeof meta(ACCION_KEY, handler) === 'string' ? String(meta(ACCION_KEY, handler)) : undefined,
          tambienDesde: meta(TAMBIEN_DESDE_KEY, handler),
        },
      ];
    });
}

describe('C2: cobertura de permisos en todos los controladores', () => {
  const porArchivo = new Map<Clase, string>();
  let rutas: Ruta[] = [];
  let registrados = new Set<unknown>();

  beforeAll(async () => {
    process.env['JWT_SECRET'] ??= 'c'.repeat(48);
    for (const archivo of archivosController(SRC)) {
      const mod: Record<string, unknown> = await import(pathToFileURL(archivo).href);
      for (const valor of Object.values(mod)) {
        if (esControlador(valor)) porArchivo.set(valor, relative(SRC, archivo).replace(/\\/g, '/'));
      }
    }
    rutas = [...porArchivo].flatMap(([clase, archivo]) => rutasDe(clase, archivo));
    registrados = controladoresRegistrados(AppModule);
  }, 60_000);

  it('encuentra todos los controladores del árbol (y los registrados están entre ellos)', () => {
    expect(porArchivo.size).toBeGreaterThanOrEqual(58);
    for (const c of registrados) expect(esControlador(c) && porArchivo.has(c)).toBe(true);
    const noRegistrados = [...porArchivo.keys()].filter((c) => !registrados.has(c)).map((c) => c.name);
    // MenuModule no está importado en AppModule; se clasifica igual.
    expect(noRegistrados).toContain('MenuController');
    expect(rutas.length).toBeGreaterThan(250);
  });

  it('cada ruta está cubierta por @Public, @LecturaCompartida (método o clase) o @Modulo de su clase', () => {
    const sinClasificar = rutas
      .filter((r) => !r.publico && !r.compartida && r.modulo === undefined)
      .map((r) => `${r.archivo} ${r.controlador}.${r.metodo} ${r.verbo} ${r.path}`);
    expect(sinClasificar).toEqual([]);
  });

  it('cada @Modulo es una ClaveModulo y solo va en la clase', () => {
    for (const clase of porArchivo.keys()) {
      const v = meta(MODULO_KEY, clase);
      if (v !== undefined) expect(typeof v === 'string' && esClaveModulo(v), `${clase.name}: ${String(v)}`).toBe(true);
      const proto: Record<string, unknown> = clase.prototype;
      for (const n of Object.getOwnPropertyNames(proto).filter((x) => x !== 'constructor')) {
        const h = proto[n];
        if (typeof h === 'function') expect(meta(MODULO_KEY, h), `${clase.name}.${n}`).toBeUndefined();
      }
    }
  });

  it('cada @Accion es válida, su clase tiene @Modulo y aprobar/anular caen en un módulo que los admite', () => {
    for (const r of rutas.filter((x) => x.accion !== undefined)) {
      const id = `${r.controlador}.${r.metodo}`;
      expect(r.accion !== undefined && esAccion(r.accion), id).toBe(true);
      expect(r.modulo, id).toBeDefined();
      if (r.accion !== undefined && esAccion(r.accion) && r.modulo !== undefined && esClaveModulo(r.modulo)) {
        expect(moduloAdmiteAccion(r.modulo, r.accion), `${id}: ${r.accion} en ${r.modulo}`).toBe(true);
      }
    }
  });

  it('@TambienDesde: solo en métodos de una clase con @Modulo, con ClaveModulo válidas, sin repetir la de la clase', () => {
    for (const clase of porArchivo.keys()) expect(meta(TAMBIEN_DESDE_KEY, clase), clase.name).toBeUndefined();
    const con = rutas.filter((r) => r.tambienDesde !== undefined);
    expect(con.length).toBeGreaterThan(0);
    for (const r of con) {
      const id = `${r.controlador}.${r.metodo}`;
      expect(r.modulo, id).toBeDefined();
      expect(r.compartida || r.publico, `${id}: @TambienDesde no tiene efecto en una ruta compartida o pública`).toBe(false);
      const lista: unknown = r.tambienDesde;
      expect(Array.isArray(lista), id).toBe(true);
      const claves: readonly unknown[] = Array.isArray(lista) ? lista : [];
      expect(claves.length, id).toBeGreaterThan(0);
      for (const c of claves) {
        expect(typeof c === 'string' && esClaveModulo(c), `${id}: ${String(c)}`).toBe(true);
        expect(c, `${id}: repite el módulo de la clase`).not.toBe(r.modulo);
      }
      expect(new Set(claves).size, `${id}: claves repetidas`).toBe(claves.length);
    }
  });

  it('@LecturaCompartida solo en lecturas (GET)', () => {
    const escrituras = rutas.filter((r) => r.compartida && r.verbo !== 'GET').map((r) => `${r.controlador}.${r.metodo}`);
    expect(escrituras).toEqual([]);
  });

  it('casos clave del inventario (§7.3)', () => {
    const buscar = (controlador: string, metodo: string) => rutas.find((r) => r.controlador === controlador && r.metodo === metodo);
    expect(buscar('LoginController', 'login')).toMatchObject({ publico: true });
    expect(buscar('AppController', 'getHello')).toMatchObject({ publico: true });
    expect(buscar('MeController', 'me')).toMatchObject({ publico: false, compartida: true });
    expect(buscar('MisPermisosController', 'misPermisos')).toMatchObject({ publico: false, compartida: true });
    for (const m of ['aprobar', 'observar', 'rechazar']) {
      expect(buscar('FlujoAprobacionController', m)).toMatchObject({ modulo: 'requerimientos.aprobacion', accion: 'aprobar' });
    }
    // Acciones dudosas (ajustes para estricto, 2026-10-16): por ahora basta el acceso al módulo (ver).
    for (const m of ['enviar', 'cerrarCotizacion', 'reabrirCotizacion', 'anular']) {
      expect(buscar('FlujoController', m)).toMatchObject({ modulo: 'requerimientos', accion: 'ver' });
    }
    for (const m of ['ejecutar', 'directo']) expect(buscar('PagosController', m)).toMatchObject({ modulo: 'tesoreria.pagos', accion: 'ver' });
    expect(buscar('AdministracionController', 'anular')).toMatchObject({ modulo: 'documentos.administracion', accion: 'ver' });
    expect(buscar('PagosController', 'anular')).toMatchObject({ modulo: 'tesoreria.pagos', accion: 'anular' });
    // "Con acceso a la pantalla basta": endpoints que usan pantallas de otro módulo.
    expect(buscar('RequerimientoController', 'list')).toMatchObject({ modulo: 'requerimientos', tambienDesde: ['requerimientos.aprobacion'] });
    expect(buscar('ProgramacionController', 'agenda')).toMatchObject({ modulo: 'tesoreria.programacion', tambienDesde: ['tesoreria.pagos'] });
    expect(buscar('CentroCostoController', 'getConteoEstados')).toMatchObject({ compartida: false, tambienDesde: ['dashboard'] });
    expect(buscar('CentroCostoController', 'getResumenFinanciero')).toMatchObject({ compartida: false, tambienDesde: ['dashboard'] });
    const stock = rutas.filter((r) => r.controlador === 'StockController');
    expect(stock.find((r) => r.verbo === 'GET' && r.path === '/almacen/stock')).toMatchObject({
      tambienDesde: [
        'almacen.ingresos',
        'almacen.salidas',
        'almacen.transferencias',
        'almacen.inventario-inicial',
        'almacen.prestamos',
        'almacen.kardex',
      ],
    });
    expect(stock.find((r) => r.verbo === 'PATCH')).toMatchObject({ compartida: false, tambienDesde: ['almacen.consulta'] });
    // Impresiones: solo sesión.
    for (const [verbo, path] of [
      ['GET', '/requerimientos/:id'],
      ['GET', '/requerimientos/:id/cuadro-comparativo'],
      ['GET', '/administracion/documentos-origen/:id'],
      ['GET', '/administracion/documentos-origen/:id/expediente'],
      ['GET', '/tesoreria/pagos/:id'],
    ]) {
      expect(rutas.find((r) => r.verbo === verbo && r.path === path), path).toMatchObject({ compartida: true });
    }
    expect(buscar('UsuarioController', 'list')).toMatchObject({ modulo: 'admin.usuarios', compartida: false });
    expect(buscar('RolController', 'list')).toMatchObject({ modulo: 'admin.roles', compartida: false });
    expect(buscar('AuditoriaPermisosController', 'resumen')).toMatchObject({ modulo: 'admin.roles', compartida: false });
    // Escrituras de empresas: solo con permiso (Administración, siempre estricto); lectura compartida.
    for (const r of rutas.filter((x) => x.controlador === 'EmpresaController')) {
      expect(r.modulo).toBe('admin.empresas');
      expect(r.compartida).toBe(r.verbo === 'GET');
    }
    // Ningún controlador de Administración es compartido entero ni público.
    for (const r of rutas.filter((x) => x.modulo?.startsWith('admin.'))) expect(r.publico).toBe(false);
  });
});
