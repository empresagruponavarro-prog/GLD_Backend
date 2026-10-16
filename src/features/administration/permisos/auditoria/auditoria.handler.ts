import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { AuditoriaPermisosService, esEntradaAuditoria } from '../../../../platform/auth/auditoria-permisos.js';
import { ResumenAuditoriaPermisosDto } from './auditoria.dto.js';

function esArchivoInexistente(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * Agrega el registro JSONL de negativas de permisos para revisarlo con el equipo antes de pasar a
 * modo estricto (plan 05, C4). Las líneas ilegibles se ignoran; sin archivo → lista vacía.
 */
@Injectable()
export class AuditoriaPermisosHandler {
  constructor(private readonly auditoria: AuditoriaPermisosService) {}

  async resumen(desde?: Date): Promise<ResumenAuditoriaPermisosDto[]> {
    let contenido: string;
    try {
      contenido = await readFile(this.auditoria.archivo, 'utf8');
    } catch (error) {
      if (esArchivoInexistente(error)) return [];
      throw error;
    }

    const limite = desde?.getTime();
    const grupos = new Map<string, { fila: ResumenAuditoriaPermisosDto; ultimaMs: number }>();
    for (const linea of contenido.split(/\r?\n/)) {
      if (linea.trim() === '') continue;
      let valor: unknown;
      try {
        valor = JSON.parse(linea);
      } catch {
        continue;
      }
      if (!esEntradaAuditoria(valor)) continue;
      const ms = Date.parse(valor.fecha);
      if (Number.isNaN(ms) || (limite !== undefined && ms < limite)) continue;

      const clave = [valor.modulo, valor.accion, valor.rol, valor.metodo, valor.ruta].join('\u0000');
      const actual = grupos.get(clave);
      if (actual) {
        actual.fila.veces++;
        if (ms > actual.ultimaMs) {
          actual.ultimaMs = ms;
          actual.fila.ultima = new Date(ms).toISOString();
        }
      } else {
        grupos.set(clave, {
          ultimaMs: ms,
          fila: {
            modulo: valor.modulo,
            accion: valor.accion,
            rol: valor.rol,
            metodo: valor.metodo,
            ruta: valor.ruta,
            veces: 1,
            ultima: new Date(ms).toISOString(),
          },
        });
      }
    }
    return [...grupos.values()]
      .sort((a, b) => b.fila.veces - a.fila.veces || b.ultimaMs - a.ultimaMs)
      .map((g) => g.fila);
  }
}
