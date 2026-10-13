import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Database } from '../../../prisma/prisma.module.js';

// UPLOADS_ROOT se calcula al importar el storage: se fija antes de importar el slice.
const TMP = mkdtempSync(join(tmpdir(), 'gld-docs-'));
process.env.UPLOADS_DIR = TMP;
const storage = await import('./documentos.storage.js');
const { DocumentosHandler, hoyLima, validarArchivoUrl } = await import('./documentos.handler.js');
const { CreateObraDocumentoDto, UpdateObraDocumentoDto } = await import('./documentos.dto.js');

const CC = 10;
const clave = (nombre: string, cc = CC) => `obras/${cc}/documentos/${nombre}`;

/** Crea un archivo real dentro de la carpeta de documentos del CC. */
function crearArchivo(nombre: string, cc = CC): string {
  const dir = join(TMP, 'obras', String(cc), 'documentos');
  mkdirSync(dir, { recursive: true });
  const ruta = join(dir, nombre);
  writeFileSync(ruta, 'contenido');
  return ruta;
}

function fila(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    id_centro_costo: CC,
    titulo: 'Acta 1',
    subtitulo: 'sub',
    categoria: 'Acta',
    nro_registro: 'R-1',
    fecha_emision: '2026-10-01',
    vigencia_texto: '1 año',
    estado: 'Validado',
    archivo_url: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

function mockDb(opts: { cc?: boolean; actual?: Record<string, unknown> | null; enUso?: unknown } = {}) {
  const all = vi.fn().mockResolvedValue([]);
  const update = vi.fn(async (data: Record<string, unknown>) => fila({ ...opts.actual, ...data }));
  const del = vi.fn().mockResolvedValue({});
  const documentos = {
    first: vi.fn(async (where: Record<string, unknown>) => {
      if ('archivo_url' in where) return opts.enUso ?? null;
      return opts.actual === null ? null : fila(opts.actual ?? {});
    }),
    create: vi.fn(async (data: Record<string, unknown>) => fila(data)),
    where: vi.fn(() => ({ update, delete: del, all, orderBy: vi.fn(() => ({ all })) })),
  };
  const CentroCostos = { first: vi.fn().mockResolvedValue(opts.cc === false ? null : { id: CC }) };
  const db = { orm: { public: { CentroCostos, obra_documentos_actas: documentos } } } as unknown as Database;
  return { db, documentos, update, del, all, CentroCostos };
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('documentos / storage', () => {
  it('UPLOADS_ROOT respeta UPLOADS_DIR', () => {
    expect(storage.UPLOADS_ROOT).toBe(resolve(TMP));
  });

  describe('rutaSegura', () => {
    it('acepta una clave de la carpeta de la obra', () => {
      expect(storage.rutaSegura(CC, clave('a1b2c3d4_acta.pdf'))).toBe(resolve(TMP, clave('a1b2c3d4_acta.pdf')));
    });
    it('rechaza ".." (path traversal)', () => {
      expect(() => storage.rutaSegura(CC, `obras/${CC}/documentos/../../../secreto.txt`)).toThrow(BadRequestException);
      expect(() => storage.rutaSegura(CC, `obras/${CC}/documentos/..`)).toThrow(BadRequestException);
    });
    it('rechaza claves de otra obra', () => {
      expect(() => storage.rutaSegura(CC, clave('x.pdf', 99))).toThrow(BadRequestException);
    });
    it('rechaza la carpeta de planos de la misma obra', () => {
      expect(() => storage.rutaSegura(CC, `obras/${CC}/planos/x.pdf`)).toThrow(BadRequestException);
    });
    it('rechaza rutas absolutas', () => {
      expect(() => storage.rutaSegura(CC, resolve(TMP, clave('x.pdf')))).toThrow(BadRequestException);
      expect(() => storage.rutaSegura(CC, '/etc/passwd')).toThrow(BadRequestException);
    });
    it('rechaza subcarpetas, backslashes y bytes nulos', () => {
      expect(() => storage.rutaSegura(CC, clave('sub/x.pdf'))).toThrow(BadRequestException);
      expect(() => storage.rutaSegura(CC, `obras/${CC}/documentos\\x.pdf`)).toThrow(BadRequestException);
      expect(() => storage.rutaSegura(CC, clave('x\0.pdf'))).toThrow(BadRequestException);
    });
  });

  it('tipoMime devuelve el tipo por extensión', () => {
    expect(storage.tipoMime('a.PDF')).toBe('application/pdf');
    expect(storage.tipoMime('a.png')).toBe('image/png');
    expect(storage.tipoMime('a.xyz')).toBe('application/octet-stream');
  });

  it('sanitizar y nombreDescarga', () => {
    expect(storage.sanitizar('Acta Reunión Nº 1.PDF')).toBe('Acta_Reunion_N_1.pdf');
    expect(storage.nombreDescarga(clave('a1b2c3d4_Acta_1.pdf'))).toBe('Acta_1.pdf');
  });

  it('normalizarNombre convierte latin1 a utf8', () => {
    const latin1 = Buffer.from('Reunión.pdf', 'utf8').toString('latin1');
    expect(storage.normalizarNombre(latin1)).toBe('Reunión.pdf');
  });

  it('fileFilter permite extensiones válidas y rechaza el resto con 400', () => {
    const filtro = storage.documentoMulterOptions.fileFilter!;
    const ok = vi.fn();
    filtro({} as never, { originalname: 'a.DOCX' } as never, ok);
    expect(ok).toHaveBeenCalledWith(null, true);
    const mal = vi.fn();
    filtro({} as never, { originalname: 'virus.exe' } as never, mal);
    const [err, aceptar] = mal.mock.calls[0];
    expect(err).toBeInstanceOf(BadRequestException);
    expect(String(err.message)).toContain('.exe');
    expect(aceptar).toBe(false);
  });

  it('borrarArchivoLocal borra el archivo y no falla con externos, inexistentes ni rutas inválidas', async () => {
    const ruta = crearArchivo('11111111_a.pdf');
    await storage.borrarArchivoLocal(CC, clave('11111111_a.pdf'));
    expect(existsSync(ruta)).toBe(false);
    await expect(storage.borrarArchivoLocal(CC, 'https://x.com/a.pdf')).resolves.toBeUndefined();
    await expect(storage.borrarArchivoLocal(CC, clave('no-existe.pdf'))).resolves.toBeUndefined();
    await expect(storage.borrarArchivoLocal(CC, '../../x')).resolves.toBeUndefined();
    await expect(storage.borrarArchivoLocal(CC, null)).resolves.toBeUndefined();
  });
});

describe('documentos / validarArchivoUrl', () => {
  it('acepta https, http, vacío y claves propias', () => {
    expect(() => validarArchivoUrl(CC, 'https://drive.example.com/a.pdf')).not.toThrow();
    expect(() => validarArchivoUrl(CC, 'http://intranet/a.pdf')).not.toThrow();
    expect(() => validarArchivoUrl(CC, undefined)).not.toThrow();
    expect(() => validarArchivoUrl(CC, null)).not.toThrow();
    expect(() => validarArchivoUrl(CC, clave('a1b2c3d4_acta.pdf'))).not.toThrow();
  });
  it('rechaza javascript:, claves ajenas, traversal y cadenas vacías con 400', () => {
    expect(() => validarArchivoUrl(CC, 'javascript:alert(1)')).toThrow(BadRequestException);
    expect(() => validarArchivoUrl(CC, 'data:text/html,<b>x</b>')).toThrow(BadRequestException);
    expect(() => validarArchivoUrl(CC, 'file:///etc/passwd')).toThrow(BadRequestException);
    expect(() => validarArchivoUrl(CC, clave('x.pdf', 99))).toThrow(BadRequestException);
    expect(() => validarArchivoUrl(CC, `obras/${CC}/documentos/../../1/x`)).toThrow(BadRequestException);
    expect(() => validarArchivoUrl(CC, '')).toThrow(BadRequestException);
  });
  it('rechaza una URL http mal formada', () => {
    expect(() => validarArchivoUrl(CC, 'http://')).toThrow(BadRequestException);
  });
});

describe('documentos / DTO (ValidationPipe)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const patch = (body: unknown) => pipe.transform(body, { type: 'body', metatype: UpdateObraDocumentoDto });

  it('null en opcionales pasa y se conserva', async () => {
    const dto = await patch({ subtitulo: null, nro_registro: null, fecha_emision: null, vigencia_texto: null, archivo_url: null });
    expect(dto).toMatchObject({ subtitulo: null, nro_registro: null, fecha_emision: null, vigencia_texto: null, archivo_url: null });
  });
  it('null en obligatorios (titulo, categoria, estado) da 400', async () => {
    for (const campo of ['titulo', 'categoria', 'estado']) {
      await expect(patch({ [campo]: null })).rejects.toBeInstanceOf(BadRequestException);
    }
  });
  it('titulo vacío y categoría inválida dan 400; {} es válido', async () => {
    await expect(patch({ titulo: '' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(patch({ categoria: 'Nada' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(patch({})).resolves.toBeInstanceOf(UpdateObraDocumentoDto);
  });
  it('create exige titulo y categoria', async () => {
    const crear = (b: unknown) => pipe.transform(b, { type: 'body', metatype: CreateObraDocumentoDto });
    await expect(crear({ titulo: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(crear({ titulo: 'x', categoria: 'Acta' })).resolves.toBeDefined();
  });
});

describe('documentos / DocumentosHandler', () => {
  describe('list', () => {
    it('404 si el centro de costo no existe', async () => {
      const { db } = mockDb({ cc: false });
      await expect(new DocumentosHandler(db).list(CC)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('lista si existe', async () => {
      const { db, all } = mockDb();
      all.mockResolvedValue([fila()]);
      const res = await new DocumentosHandler(db).list(CC);
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ id: 5, titulo: 'Acta 1', archivo_url: undefined });
    });
  });

  describe('create', () => {
    it('rechaza archivo_url inválido (400) sin insertar', async () => {
      const { db, documentos } = mockDb();
      const h = new DocumentosHandler(db);
      await expect(h.create(CC, { titulo: 'x', categoria: 'Acta', archivo_url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(h.create(CC, { titulo: 'x', categoria: 'Acta', archivo_url: clave('a.pdf', 99) })).rejects.toBeInstanceOf(BadRequestException);
      expect(documentos.create).not.toHaveBeenCalled();
    });
    it('acepta URL https y clave propia', async () => {
      const { db, documentos } = mockDb();
      const h = new DocumentosHandler(db);
      await h.create(CC, { titulo: ' x ', categoria: 'Acta', archivo_url: 'https://a.com/x.pdf' });
      await h.create(CC, { titulo: 'y', categoria: 'Acta', archivo_url: clave('a1b2c3d4_x.pdf') });
      expect(documentos.create).toHaveBeenCalledTimes(2);
      expect(documentos.create.mock.calls[0][0]).toMatchObject({ titulo: 'x', estado: 'Pendiente' });
    });
  });

  describe('valores por defecto al crear', () => {
    afterEach(() => vi.useRealTimers());

    it('el estado inicial es Pendiente y la emisión es hoy (hora de Lima)', async () => {
      // 14-oct 03:30 UTC = 13-oct 22:30 en Lima: el día de Lima, no el de UTC.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-14T03:30:00Z'));
      const { db, documentos } = mockDb();
      await new DocumentosHandler(db).create(CC, { titulo: 'x', categoria: 'Acta' });
      expect(documentos.create.mock.calls[0][0]).toMatchObject({ estado: 'Pendiente', fecha_emision: '2026-10-13' });
    });

    it('respeta el estado y la fecha enviados', async () => {
      const { db, documentos } = mockDb();
      await new DocumentosHandler(db).create(CC, { titulo: 'x', categoria: 'Acta', estado: 'Validado', fecha_emision: '2026-01-05' });
      expect(documentos.create.mock.calls[0][0]).toMatchObject({ estado: 'Validado', fecha_emision: '2026-01-05' });
    });

    it('hoyLima cambia de día a medianoche de Lima, no de UTC', () => {
      expect(hoyLima(new Date('2026-10-14T04:59:59Z'))).toBe('2026-10-13');
      expect(hoyLima(new Date('2026-10-14T05:00:00Z'))).toBe('2026-10-14');
    });
  });

  describe('update', () => {
    it('null en opcionales los limpia y undefined no toca', async () => {
      const { db, update } = mockDb({ actual: { archivo_url: 'https://a.com/x.pdf' } });
      const res = await new DocumentosHandler(db).update(CC, 5, {
        subtitulo: null,
        nro_registro: null,
        fecha_emision: null,
        vigencia_texto: null,
        archivo_url: null,
      });
      expect(update).toHaveBeenCalledTimes(1);
      const data = update.mock.calls[0][0];
      expect(data).toEqual({ subtitulo: null, nro_registro: null, fecha_emision: null, vigencia_texto: null, archivo_url: null });
      expect(res.archivo_url).toBeUndefined();
    });
    it('PATCH {} devuelve la fila actual sin tocar la BD', async () => {
      const { db, update } = mockDb();
      const res = await new DocumentosHandler(db).update(CC, 5, {});
      expect(update).not.toHaveBeenCalled();
      expect(res).toMatchObject({ id: 5, titulo: 'Acta 1' });
    });
    it('titulo en blanco da 400', async () => {
      const { db, update } = mockDb();
      await expect(new DocumentosHandler(db).update(CC, 5, { titulo: '   ' })).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });
    it('archivo_url inválido da 400 sin actualizar', async () => {
      const { db, update } = mockDb();
      await expect(new DocumentosHandler(db).update(CC, 5, { archivo_url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });
    it('404 si el documento no pertenece al CC', async () => {
      const { db } = mockDb({ actual: null });
      await expect(new DocumentosHandler(db).update(CC, 5, { titulo: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
    it('al reemplazar el archivo borra el anterior del disco', async () => {
      const previo = crearArchivo('22222222_viejo.pdf');
      const nuevo = crearArchivo('33333333_nuevo.pdf');
      const { db } = mockDb({ actual: { archivo_url: clave('22222222_viejo.pdf') } });
      await new DocumentosHandler(db).update(CC, 5, { archivo_url: clave('33333333_nuevo.pdf') });
      expect(existsSync(previo)).toBe(false);
      expect(existsSync(nuevo)).toBe(true);
    });
    it('al limpiar archivo_url (null) borra el archivo anterior', async () => {
      const previo = crearArchivo('44444444_viejo.pdf');
      const { db } = mockDb({ actual: { archivo_url: clave('44444444_viejo.pdf') } });
      await new DocumentosHandler(db).update(CC, 5, { archivo_url: null });
      expect(existsSync(previo)).toBe(false);
    });
    it('no borra el archivo si archivo_url no cambia ni si solo se edita otro campo', async () => {
      const previo = crearArchivo('55555555_igual.pdf');
      const { db } = mockDb({ actual: { archivo_url: clave('55555555_igual.pdf') } });
      const h = new DocumentosHandler(db);
      await h.update(CC, 5, { archivo_url: clave('55555555_igual.pdf') });
      await h.update(CC, 5, { titulo: 'otro' });
      expect(existsSync(previo)).toBe(true);
    });
    it('un enlace externo previo no intenta borrar nada y no falla', async () => {
      const { db } = mockDb({ actual: { archivo_url: 'https://a.com/x.pdf' } });
      await expect(new DocumentosHandler(db).update(CC, 5, { archivo_url: null })).resolves.toBeDefined();
    });
  });

  describe('remove', () => {
    it('elimina el documento y su archivo local', async () => {
      const previo = crearArchivo('66666666_borrar.pdf');
      const { db, del } = mockDb({ actual: { archivo_url: clave('66666666_borrar.pdf') } });
      const res = await new DocumentosHandler(db).remove(CC, 5);
      expect(del).toHaveBeenCalled();
      expect(res).toEqual({ deleted: true, id: 5 });
      expect(existsSync(previo)).toBe(false);
    });
    it('no falla si el archivo ya no existe', async () => {
      const { db } = mockDb({ actual: { archivo_url: clave('fantasma.pdf') } });
      await expect(new DocumentosHandler(db).remove(CC, 5)).resolves.toEqual({ deleted: true, id: 5 });
    });
  });

  describe('descartarArchivo', () => {
    it('borra un archivo sin documento asociado', async () => {
      const ruta = crearArchivo('77777777_huerfano.pdf');
      const { db } = mockDb();
      const res = await new DocumentosHandler(db).descartarArchivo(CC, clave('77777777_huerfano.pdf'));
      expect(res).toEqual({ deleted: true, clave: clave('77777777_huerfano.pdf') });
      expect(existsSync(ruta)).toBe(false);
    });
    it('si la clave ya pertenece a un documento no borra', async () => {
      const ruta = crearArchivo('88888888_enuso.pdf');
      const { db } = mockDb({ enUso: fila({ archivo_url: clave('88888888_enuso.pdf') }) });
      const res = await new DocumentosHandler(db).descartarArchivo(CC, clave('88888888_enuso.pdf'));
      expect(res).toEqual({ deleted: false, clave: clave('88888888_enuso.pdf') });
      expect(existsSync(ruta)).toBe(true);
    });
    it('rechaza claves vacías, externas, de otra obra o con traversal (400)', async () => {
      const h = new DocumentosHandler(mockDb().db);
      await expect(h.descartarArchivo(CC, undefined)).rejects.toBeInstanceOf(BadRequestException);
      await expect(h.descartarArchivo(CC, 'https://a.com/x.pdf')).rejects.toBeInstanceOf(BadRequestException);
      await expect(h.descartarArchivo(CC, clave('x.pdf', 99))).rejects.toBeInstanceOf(BadRequestException);
      await expect(h.descartarArchivo(CC, `obras/${CC}/documentos/../../99/documentos/x.pdf`)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('descargar', () => {
    it('enlace externo → tipo externo', async () => {
      const { db } = mockDb({ actual: { archivo_url: 'https://a.com/x.pdf' } });
      await expect(new DocumentosHandler(db).descargar(CC, 5)).resolves.toEqual({ tipo: 'externo', url: 'https://a.com/x.pdf' });
    });
    it('sin archivo → 404', async () => {
      const { db } = mockDb({ actual: { archivo_url: null } });
      await expect(new DocumentosHandler(db).descargar(CC, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('archivo borrado del disco → 404', async () => {
      const { db } = mockDb({ actual: { archivo_url: clave('99999999_perdido.pdf') } });
      await expect(new DocumentosHandler(db).descargar(CC, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('archivo local → ruta y nombre limpio', async () => {
      const ruta = crearArchivo('aaaaaaaa_Acta_1.pdf');
      const { db } = mockDb({ actual: { archivo_url: clave('aaaaaaaa_Acta_1.pdf') } });
      await expect(new DocumentosHandler(db).descargar(CC, 5)).resolves.toEqual({ tipo: 'local', ruta, nombre: 'Acta_1.pdf' });
    });
  });

  describe('subirArchivo', () => {
    it('400 sin archivo', async () => {
      await expect(new DocumentosHandler(mockDb().db).subirArchivo(CC, undefined)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('devuelve clave, nombre original (utf8) y bytes', async () => {
      const ruta = crearArchivo('bbbbbbbb_Reunion.pdf');
      const original = Buffer.from('Reunión.pdf', 'utf8').toString('latin1');
      const res = await new DocumentosHandler(mockDb().db).subirArchivo(CC, {
        filename: 'bbbbbbbb_Reunion.pdf',
        originalname: original,
        size: 1234,
        path: ruta,
      });
      expect(res).toEqual({ archivo_url: clave('bbbbbbbb_Reunion.pdf'), nombre_original: 'Reunión.pdf', bytes: 1234 });
    });
    it('si el CC no existe → 404 y borra el archivo ya escrito', async () => {
      const ruta = crearArchivo('cccccccc_x.pdf');
      const { db } = mockDb({ cc: false });
      await expect(
        new DocumentosHandler(db).subirArchivo(CC, { filename: 'cccccccc_x.pdf', originalname: 'x.pdf', size: 1, path: ruta }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(existsSync(ruta)).toBe(false);
    });
    it('la limpieza borra huérfanos de más de 24 h y conserva recientes y en uso', async () => {
      const viejoHuerfano = crearArchivo('dddddddd_viejo.pdf');
      const viejoEnUso = crearArchivo('eeeeeeee_enuso.pdf');
      const reciente = crearArchivo('ffffffff_reciente.pdf');
      const hace48h = new Date(Date.now() - 48 * 3600 * 1000);
      utimesSync(viejoHuerfano, hace48h, hace48h);
      utimesSync(viejoEnUso, hace48h, hace48h);
      const { db, all } = mockDb();
      all.mockResolvedValue([fila({ archivo_url: clave('eeeeeeee_enuso.pdf') })]);
      await new DocumentosHandler(db).subirArchivo(CC, { filename: 'ffffffff_reciente.pdf', originalname: 'r.pdf', size: 1, path: reciente });
      await vi.waitFor(() => expect(existsSync(viejoHuerfano)).toBe(false));
      expect(existsSync(viejoEnUso)).toBe(true);
      expect(existsSync(reciente)).toBe(true);
    });
    it('un fallo en la limpieza no rompe la subida', async () => {
      const ruta = crearArchivo('gggggggg_x.pdf');
      const { db, documentos } = mockDb();
      documentos.where.mockImplementation(() => {
        throw new Error('BD caída');
      });
      await expect(
        new DocumentosHandler(db).subirArchivo(CC, { filename: 'gggggggg_x.pdf', originalname: 'x.pdf', size: 1, path: ruta }),
      ).resolves.toMatchObject({ bytes: 1 });
    });
  });
});
