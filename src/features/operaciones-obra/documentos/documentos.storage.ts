import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';
import multer from 'multer';

/** Raíz de archivos subidos (configurable con UPLOADS_DIR). */
export const UPLOADS_ROOT = resolve(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'));

export const DOCUMENTO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
export const DOCUMENTO_EXTENSIONES = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png', '.zip'] as const;

const MIME_POR_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.zip': 'application/zip',
};

/** Content-Type según la extensión del archivo. */
export function tipoMime(nombre: string): string {
  return MIME_POR_EXTENSION[extname(nombre).toLowerCase()] ?? 'application/octet-stream';
}

/** Clave relativa (guardada en archivo_url) de la carpeta de documentos de un CC. */
export function carpetaDocumentos(idCentroCosto: number): string {
  return `obras/${idCentroCosto}/documentos`;
}

/** true si archivo_url es un enlace externo http(s). */
export function esUrlExterna(archivoUrl: string | null | undefined): archivoUrl is string {
  return !!archivoUrl && /^https?:\/\//i.test(archivoUrl);
}

/** true si archivo_url apunta a un archivo local (no a un enlace externo). */
export function esArchivoLocal(archivoUrl: string | null | undefined): archivoUrl is string {
  return !!archivoUrl && !esUrlExterna(archivoUrl);
}

/**
 * Resuelve la ruta absoluta de una clave local validando que pertenezca
 * a la carpeta de documentos del CC (evita path traversal y cruces entre obras).
 */
export function rutaSegura(idCentroCosto: number, clave: string): string {
  const carpeta = carpetaDocumentos(idCentroCosto);
  const base = resolve(UPLOADS_ROOT, carpeta);
  const ruta = resolve(UPLOADS_ROOT, clave);
  // La clave debe ser exactamente `carpeta/archivo` (sin subcarpetas ni caracteres de ruta raros).
  const resto = clave.startsWith(`${carpeta}/`) ? clave.slice(carpeta.length + 1) : '';
  if (!resto || /[\\/:\0]/.test(resto) || resto === '.' || resto === '..' || !ruta.startsWith(base + sep)) {
    throw new BadRequestException('Ruta de archivo inválida para este centro de costo');
  }
  return ruta;
}

/** Nombre "limpio" para descarga: quita el prefijo uuid_ del archivo guardado. */
export function nombreDescarga(clave: string): string {
  return basename(clave).replace(/^[0-9a-f]{8}_/i, '');
}

export async function borrarArchivoLocal(idCentroCosto: number, archivoUrl: string | null | undefined): Promise<void> {
  if (!esArchivoLocal(archivoUrl)) return;
  try {
    await unlink(rutaSegura(idCentroCosto, archivoUrl));
  } catch {
    // Archivo inexistente o ruta inválida: no bloquea la operación principal.
  }
}

/** multer entrega originalname en latin1; se normaliza a utf8 para tildes/ñ. */
export function normalizarNombre(originalname: string): string {
  return Buffer.from(originalname, 'latin1').toString('utf8');
}

export function sanitizar(nombre: string): string {
  const ext = extname(nombre).toLowerCase();
  const base = basename(nombre, extname(nombre))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return `${base || 'documento'}${ext}`;
}

/** Configuración multer: disco en uploads/obras/{idCC}/documentos, 50 MB, extensiones permitidas. */
export const documentoMulterOptions: MulterOptions = {
  limits: { fileSize: DOCUMENTO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(normalizarNombre(file.originalname)).toLowerCase();
    if (!(DOCUMENTO_EXTENSIONES as readonly string[]).includes(ext)) {
      cb(new BadRequestException(`Formato no permitido (${ext || 'sin extensión'}). Usa: ${DOCUMENTO_EXTENSIONES.join(' ')}`), false);
      return;
    }
    cb(null, true);
  },
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const id = Number(req.params['idCentroCosto']);
      if (!Number.isInteger(id) || id <= 0) {
        cb(new BadRequestException('idCentroCosto inválido'), '');
        return;
      }
      const dir = join(UPLOADS_ROOT, carpetaDocumentos(id));
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID().slice(0, 8)}_${sanitizar(normalizarNombre(file.originalname))}`);
    },
  }),
};
