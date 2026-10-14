import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { toInstantString } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar } from '../../presupuestos/presupuestos.helpers.js';
import { assertCentroCosto, compact, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
import type {
  ArchivoDocumentoDto,
  CreateObraDocumentoDto,
  DescartarArchivoDocumentoDto,
  EliminarDocumentoDto,
  ObraDocumentoDto,
  UpdateObraDocumentoDto,
} from './documentos.dto.js';
import {
  UPLOADS_ROOT,
  borrarArchivoLocal,
  carpetaDocumentos,
  esArchivoLocal,
  esUrlExterna,
  nombreDescarga,
  normalizarNombre,
  rutaSegura,
} from './documentos.storage.js';

/** Archivos sin documento asociado más antiguos que esto se eliminan en la limpieza automática. */
const HUERFANO_MS = 24 * 60 * 60 * 1000;

/** Datos mínimos del archivo que entrega multer (diskStorage). */
export interface ArchivoSubido {
  filename: string;
  originalname: string;
  size: number;
  path: string;
}

export type DescargaDocumento = { tipo: 'externo'; url: string } | { tipo: 'local'; ruta: string; nombre: string };

/** Estado con el que nace un documento si no se indica otro. */
const ESTADO_INICIAL = 'Pendiente';

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de Lima, para la emisión por defecto. */
export function hoyLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(ahora);
}

type DocumentoRow =NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_documentos_actas']['first']>>>;

export function mapDocumento(d: DocumentoRow): ObraDocumentoDto {
  return {
    id: d.id,
    titulo: d.titulo ?? '',
    subtitulo: d.subtitulo ?? undefined,
    categoria: d.categoria ?? 'Otros',
    nro_registro: d.nro_registro ?? undefined,
    fecha_emision: d.fecha_emision ? readDateOnly(d.fecha_emision) : undefined,
    vigencia_texto: d.vigencia_texto ?? undefined,
    estado: d.estado ?? ESTADO_INICIAL,
    archivo_url: d.archivo_url ?? undefined,
    created_at: toInstantString(d.created_at),
  };
}

/** Valor de un campo opcional en PATCH: undefined = no tocar, null = limpiar, otro = convertir. */
function parcial<T, R>(value: T | null | undefined, fn: (v: T) => R): R | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return fn(value);
}

/** Valida archivo_url: URL http(s) válida o clave local de la carpeta de documentos del CC. */
export function validarArchivoUrl(idCentroCosto: number, archivoUrl: string | null | undefined): void {
  if (archivoUrl === undefined || archivoUrl === null) return;
  if (esUrlExterna(archivoUrl)) {
    try {
      const { protocol } = new URL(archivoUrl);
      if (protocol === 'http:' || protocol === 'https:') return;
    } catch {
      // cae al error de abajo
    }
    throw new BadRequestException('archivo_url no es una URL http(s) válida');
  }
  rutaSegura(idCentroCosto, archivoUrl);
}

@Injectable()
export class DocumentosHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(idCentroCosto: number): Promise<ObraDocumentoDto[]> {
    await assertCentroCosto(this.db, idCentroCosto);
    const rows = await this.db.orm.public.obra_documentos_actas
      .where({ id_centro_costo: idCentroCosto })
      .orderBy((d) => d.id.desc())
      .all();
    return rows.map(mapDocumento);
  }

  async create(idCentroCosto: number, dto: CreateObraDocumentoDto): Promise<ObraDocumentoDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    validarArchivoUrl(idCentroCosto, dto.archivo_url);
    const row = await this.db.orm.public.obra_documentos_actas.create({
      id_centro_costo: idCentroCosto,
      titulo: toVarchar<255>(dto.titulo.trim()),
      subtitulo: toVarchar<1000>(dto.subtitulo),
      categoria: toVarchar<100>(dto.categoria),
      nro_registro: toVarchar<100>(dto.nro_registro),
      fecha_emision: toDateOnly(dto.fecha_emision) ?? hoyLima(),
      vigencia_texto: toVarchar<100>(dto.vigencia_texto),
      estado: toVarchar<50>(dto.estado ?? ESTADO_INICIAL),
      archivo_url: toVarchar<1000>(dto.archivo_url),
    });
    return mapDocumento(row);
  }

  /**
   * PATCH parcial: `undefined` no toca la columna, `null` limpia los opcionales.
   * Un PATCH sin campos devuelve la fila actual sin tocar la BD (200).
   */
  async update(idCentroCosto: number, idDocumento: number, dto: UpdateObraDocumentoDto): Promise<ObraDocumentoDto> {
    const actual = await this.findOrFail(idCentroCosto, idDocumento);
    validarArchivoUrl(idCentroCosto, dto.archivo_url);
    const titulo = dto.titulo?.trim();
    if (dto.titulo !== undefined && !titulo) throw new BadRequestException('titulo no puede estar vacío');

    const cambios = compact({
      titulo: toVarchar<255>(titulo),
      subtitulo: parcial(dto.subtitulo, (v) => toVarchar<1000>(v)),
      categoria: toVarchar<100>(dto.categoria),
      nro_registro: parcial(dto.nro_registro, (v) => toVarchar<100>(v)),
      fecha_emision: parcial(dto.fecha_emision, (v) => toDateOnly(v)),
      vigencia_texto: parcial(dto.vigencia_texto, (v) => toVarchar<100>(v)),
      estado: toVarchar<50>(dto.estado),
      archivo_url: parcial(dto.archivo_url, (v) => toVarchar<1000>(v)),
    });
    if (Object.keys(cambios).length === 0) return mapDocumento(actual);

    const row = await this.db.orm.public.obra_documentos_actas.where({ id: idDocumento }).update(cambios);
    if (!row) throw new NotFoundException(`Documento ${idDocumento} no encontrado`);
    // Si se reemplazó o limpió el archivo, se borra el anterior del disco.
    if (dto.archivo_url !== undefined && dto.archivo_url !== actual.archivo_url) {
      await borrarArchivoLocal(idCentroCosto, actual.archivo_url);
    }
    return mapDocumento(row);
  }

  async remove(idCentroCosto: number, idDocumento: number): Promise<EliminarDocumentoDto> {
    const actual = await this.findOrFail(idCentroCosto, idDocumento);
    await this.db.orm.public.obra_documentos_actas.where({ id: idDocumento }).delete();
    await borrarArchivoLocal(idCentroCosto, actual.archivo_url);
    return { deleted: true, id: idDocumento };
  }

  /** Registra un archivo ya guardado por multer y devuelve la clave para archivo_url. */
  async subirArchivo(idCentroCosto: number, file: ArchivoSubido | undefined): Promise<ArchivoDocumentoDto> {
    if (file?.path) {
      if (process.env.ALLOW_LOCAL_STORAGE !== 'true') {
        await unlink(file.path).catch(() => undefined);
        throw new BadRequestException(
          'El almacenamiento local de archivos en el servidor está deshabilitado. Ingrese el enlace en la nube (Google Drive, OneDrive, etc.).',
        );
      }
    }
    if (!file) throw new BadRequestException('Debes adjuntar un archivo (campo "archivo")');
    try {
      await assertCentroCosto(this.db, idCentroCosto);
    } catch (err) {
      await unlink(file.path).catch(() => undefined);
      throw err;
    }
    void this.limpiarHuerfanos(idCentroCosto);
    return {
      archivo_url: `${carpetaDocumentos(idCentroCosto)}/${file.filename}`,
      nombre_original: normalizarNombre(file.originalname),
      bytes: file.size,
    };
  }

  /** Resuelve el archivo de un documento: enlace externo o ruta local en disco. */
  async descargar(idCentroCosto: number, idDocumento: number): Promise<DescargaDocumento> {
    const doc = await this.findOrFail(idCentroCosto, idDocumento);
    const url = doc.archivo_url;
    if (!url) throw new NotFoundException(`El documento ${idDocumento} no tiene archivo adjunto`);
    if (!esArchivoLocal(url)) return { tipo: 'externo', url };
    const ruta = rutaSegura(idCentroCosto, url);
    if (!existsSync(ruta)) throw new NotFoundException('El archivo del documento ya no existe en el servidor');
    return { tipo: 'local', ruta, nombre: nombreDescarga(url) };
  }

  /** Borra un archivo subido que no quedó vinculado a ningún documento (modal cancelado). */
  async descartarArchivo(idCentroCosto: number, clave: string | undefined): Promise<DescartarArchivoDocumentoDto> {
    if (!esArchivoLocal(clave)) throw new BadRequestException('Clave de archivo inválida');
    const ruta = rutaSegura(idCentroCosto, clave);
    const enUso = await this.db.orm.public.obra_documentos_actas.first({
      id_centro_costo: idCentroCosto,
      archivo_url: toVarchar<1000>(clave),
    });
    // Nunca se borra un archivo que ya pertenece a un documento guardado.
    if (enUso) return { deleted: false, clave };
    await unlink(ruta).catch(() => undefined);
    return { deleted: true, clave };
  }

  /**
   * Red de seguridad: elimina archivos de la carpeta del CC sin documento asociado y con más de 24 h
   * (p. ej. si se cerró la pestaña con el modal abierto y no se pudo descartar).
   */
  private async limpiarHuerfanos(idCentroCosto: number): Promise<void> {
    try {
      const carpeta = carpetaDocumentos(idCentroCosto);
      const dir = join(UPLOADS_ROOT, carpeta);
      const archivos = await readdir(dir);
      if (archivos.length === 0) return;
      const docs = await this.db.orm.public.obra_documentos_actas.where({ id_centro_costo: idCentroCosto }).all();
      const enUso = new Set<string>(docs.flatMap((d) => (d.archivo_url ? [String(d.archivo_url)] : [])));
      const limite = Date.now() - HUERFANO_MS;
      for (const nombre of archivos) {
        if (enUso.has(`${carpeta}/${nombre}`)) continue;
        const info = await stat(join(dir, nombre));
        if (info.isFile() && info.mtimeMs < limite) await unlink(join(dir, nombre)).catch(() => undefined);
      }
    } catch {
      // La limpieza nunca debe romper la subida.
    }
  }

  private async findOrFail(idCentroCosto: number, idDocumento: number) {
    const row = await this.db.orm.public.obra_documentos_actas.first({ id: idDocumento, id_centro_costo: idCentroCosto });
    if (!row) throw new NotFoundException(`Documento ${idDocumento} no encontrado para CC ${idCentroCosto}`);
    return row;
  }
}
