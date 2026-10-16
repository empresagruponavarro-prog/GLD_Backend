import { Logger } from '@nestjs/common';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditoriaPermisosService, esEntradaAuditoria, type EntradaAuditoriaPermisos } from './auditoria-permisos.js';

const entrada = (over: Partial<EntradaAuditoriaPermisos> = {}): EntradaAuditoriaPermisos => ({
  fecha: '2026-10-15T15:00:00.000Z',
  modo: 'auditoria',
  aplicado: false,
  usuario: 'USR-0042',
  rol: 'Limitado',
  modulo: 'tesoreria.pagos',
  accion: 'ver',
  metodo: 'GET',
  ruta: '/tesoreria/pagos/:id',
  controlador: 'PagosController',
  handler: 'getById',
  ...over,
});

describe('AuditoriaPermisosService (escritor JSONL)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gld-permisos-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('crea el directorio si no existe y escribe una línea JSON por negativa, en orden', async () => {
    const archivo = join(dir, 'logs', 'permisos-auditoria.jsonl');
    const servicio = new AuditoriaPermisosService(archivo);
    servicio.registrar(entrada());
    servicio.registrar(entrada({ accion: 'crear', metodo: 'POST', ruta: '/tesoreria/pagos', aplicado: true, modo: 'estricto' }));
    await servicio.pendientes();

    const lineas = (await readFile(archivo, 'utf8')).split('\n');
    expect(lineas).toHaveLength(3);
    expect(lineas[2]).toBe('');
    const [a, b] = lineas.slice(0, 2).map((l) => JSON.parse(l));
    expect(a).toEqual(entrada());
    expect(b).toMatchObject({ accion: 'crear', aplicado: true, modo: 'estricto' });
    expect(esEntradaAuditoria(a)).toBe(true);
  });

  it('agrega al final de un archivo existente (append)', async () => {
    const archivo = join(dir, 'auditoria.jsonl');
    await writeFile(archivo, `${JSON.stringify(entrada({ rol: 'Previo' }))}\n`, 'utf8');
    const servicio = new AuditoriaPermisosService(archivo);
    servicio.registrar(entrada());
    await servicio.pendientes();
    const lineas = (await readFile(archivo, 'utf8')).trim().split('\n');
    expect(lineas.map((l) => JSON.parse(l).rol)).toEqual(['Previo', 'Limitado']);
  });

  it('un fallo de escritura no lanza: se registra en el log y las siguientes siguen intentándose', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    // El "directorio" padre es un archivo: mkdir/appendFile fallan.
    const bloqueo = join(dir, 'soy-un-archivo');
    await writeFile(bloqueo, 'x', 'utf8');
    const servicio = new AuditoriaPermisosService(join(bloqueo, 'auditoria.jsonl'));
    expect(() => servicio.registrar(entrada())).not.toThrow();
    servicio.registrar(entrada());
    await expect(servicio.pendientes()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('No se pudo escribir el registro de auditoría'));
  });

  it('esEntradaAuditoria rechaza líneas incompletas o con valores inválidos', () => {
    expect(esEntradaAuditoria(null)).toBe(false);
    expect(esEntradaAuditoria('x')).toBe(false);
    expect(esEntradaAuditoria({ ...entrada(), accion: 'borrar' })).toBe(false);
    expect(esEntradaAuditoria({ ...entrada(), modo: 'otro' })).toBe(false);
    expect(esEntradaAuditoria({ ...entrada(), aplicado: 'no' })).toBe(false);
    const { ruta: _ruta, ...sinRuta } = entrada();
    expect(esEntradaAuditoria(sinRuta)).toBe(false);
  });
});
