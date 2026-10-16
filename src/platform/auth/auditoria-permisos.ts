import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { esAccion, type Accion } from './permisos.js';
import { MODOS_PERMISOS, type ModoPermisos } from './permisos-modo.js';

/** Una negativa de permisos (registrada en auditoría o aplicada con 403). */
export interface EntradaAuditoriaPermisos {
  /** ISO 8601. */
  fecha: string;
  modo: ModoPermisos;
  /** `true` si se respondió 403; `false` si solo se registró (modo auditoría). */
  aplicado: boolean;
  /** `usuarios.IdUsuario` */
  usuario: string;
  rol: string;
  modulo: string;
  accion: Accion;
  metodo: string;
  /** Ruta declarada en el controlador (`/requerimientos/:id/aprobar`), sin ids ni query. */
  ruta: string;
  controlador: string;
  handler: string;
}

/** Token opcional para cambiar el archivo (tests). */
export const ARCHIVO_AUDITORIA_PERMISOS = Symbol('ARCHIVO_AUDITORIA_PERMISOS');

/** `logs/permisos-auditoria.jsonl` bajo el directorio de trabajo (`logs` está en .gitignore). */
export function archivoAuditoriaPorDefecto(): string {
  return join(process.cwd(), 'logs', 'permisos-auditoria.jsonl');
}

function esModo(valor: unknown): valor is ModoPermisos {
  return MODOS_PERMISOS.some((m) => m === valor);
}

/** Valida (y estrecha) una línea ya parseada del JSONL. */
export function esEntradaAuditoria(valor: unknown): valor is EntradaAuditoriaPermisos {
  if (!valor || typeof valor !== 'object') return false;
  return (
    'fecha' in valor &&
    typeof valor.fecha === 'string' &&
    'usuario' in valor &&
    typeof valor.usuario === 'string' &&
    'rol' in valor &&
    typeof valor.rol === 'string' &&
    'modulo' in valor &&
    typeof valor.modulo === 'string' &&
    'metodo' in valor &&
    typeof valor.metodo === 'string' &&
    'ruta' in valor &&
    typeof valor.ruta === 'string' &&
    'controlador' in valor &&
    typeof valor.controlador === 'string' &&
    'handler' in valor &&
    typeof valor.handler === 'string' &&
    'modo' in valor &&
    esModo(valor.modo) &&
    'aplicado' in valor &&
    typeof valor.aplicado === 'boolean' &&
    'accion' in valor &&
    typeof valor.accion === 'string' &&
    esAccion(valor.accion)
  );
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Escribe cada negativa como una línea JSON (append asíncrono y en orden). Un fallo de escritura
 * se registra en el log del servidor y NUNCA rompe la petición.
 */
@Injectable()
export class AuditoriaPermisosService {
  private readonly logger = new Logger('PermisosAuditoria');
  private cola: Promise<void> = Promise.resolve();
  readonly archivo: string;

  constructor(@Optional() @Inject(ARCHIVO_AUDITORIA_PERMISOS) archivo?: string) {
    this.archivo = archivo ?? archivoAuditoriaPorDefecto();
  }

  registrar(entrada: EntradaAuditoriaPermisos): void {
    const linea = `${JSON.stringify(entrada)}\n`;
    this.cola = this.cola.then(() => this.escribir(linea));
  }

  /** Resuelve cuando se escribió (o falló) todo lo registrado hasta ahora. */
  pendientes(): Promise<void> {
    return this.cola;
  }

  private async escribir(linea: string): Promise<void> {
    try {
      await mkdir(dirname(this.archivo), { recursive: true });
      await appendFile(this.archivo, linea, 'utf8');
    } catch (error) {
      this.logger.error(`No se pudo escribir el registro de auditoría de permisos: ${mensajeDe(error)}`);
    }
  }
}
