import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface.js';
import multer from 'multer';

/** Raíz de archivos subidos (configurable con UPLOADS_DIR). */
export const UPLOADS_ROOT = resolve(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'));

export const PLANO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
export const PLANO_EXTENSIONES = ['.pdf', '.dwg', '.dxf', '.rvt', '.ifc', '.zip'] as const;

/** Clave relativa (guardada en archivo_url) de la carpeta de planos de un CC. */
export function carpetaPlanos(idCentroCosto: number): string {
  return `obras/${idCentroCosto}/planos`;
}

/** true si archivo_url apunta a un archivo local (no a un enlace externo). */
export function esArchivoLocal(archivoUrl: string | null | undefined): archivoUrl is string {
  return !!archivoUrl && !/^https?:\/\//i.test(archivoUrl);
}

/**
 * Resuelve la ruta absoluta de una clave local validando que pertenezca
 * a la carpeta de planos del CC (evita path traversal y cruces entre obras).
 */
export function rutaSegura(idCentroCosto: number, clave: string): string {
  const base = resolve(UPLOADS_ROOT, carpetaPlanos(idCentroCosto));
  const ruta = resolve(UPLOADS_ROOT, clave);
  if (!ruta.startsWith(base + sep)) {
    throw new BadRequestException('Ruta de archivo inválida para este centro de costo');
  }
  return ruta;
}

/** Nombre "limpio" para descarga: quita el prefijo uuid_ del archivo guardado. */
export function nombreDescarga(clave: string): string {
  return basename(clave).replace(/^[0-9a-f]{8}_/i, '');
}

/** "PDF (14.2 MB)" */
export function formatoPeso(nombreOriginal: string, bytes: number): string {
  const ext = extname(nombreOriginal).replace('.', '').toUpperCase() || 'ARCHIVO';
  const mb = bytes / (1024 * 1024);
  const peso = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${ext} (${peso})`;
}

export async function borrarArchivoLocal(idCentroCosto: number, archivoUrl: string | null | undefined): Promise<void> {
  if (!esArchivoLocal(archivoUrl)) return;
  try {
    await unlink(rutaSegura(idCentroCosto, archivoUrl));
  } catch {
    // Archivo inexistente o ruta inválida: no bloquea la operación principal.
  }
}

function sanitizar(nombre: string): string {
  const ext = extname(nombre).toLowerCase();
  const base = basename(nombre, extname(nombre))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return `${base || 'plano'}${ext}`;
}

/** Configuración multer: disco en uploads/obras/{idCC}/planos, 50 MB, extensiones permitidas. */
export const planoMulterOptions: MulterOptions = {
  limits: { fileSize: PLANO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!(PLANO_EXTENSIONES as readonly string[]).includes(ext)) {
      cb(new BadRequestException(`Formato no permitido (${ext || 'sin extensión'}). Usa: ${PLANO_EXTENSIONES.join(' ')}`), false);
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
      const dir = join(UPLOADS_ROOT, carpetaPlanos(id));
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      // multer entrega originalname en latin1; se normaliza a utf8 para tildes/ñ.
      const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
      cb(null, `${randomUUID().slice(0, 8)}_${sanitizar(original)}`);
    },
  }),
};
