import { randomBytes } from 'node:crypto';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** `Algorithm.Argon2id` (const enum: no se puede importar con isolatedModules). */
const ARGON2ID = 2 as Algorithm;

/** Parametros OWASP recomendados para argon2id (19 MiB, 2 iteraciones, 1 hilo). */
const OPCIONES = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const CLAVE_MIN = 8;
export const CLAVE_MAX = 128;

/** Calcula el hash argon2id (formato PHC `$argon2id$v=19$...`). */
export function hashClave(clave: string): Promise<string> {
  return hash(clave, OPCIONES);
}

/** `true` si el valor guardado es un hash argon2 (y no una clave en texto plano heredada). */
export function esHashArgon2(valor: string | null | undefined): valor is string {
  return typeof valor === 'string' && /^\$argon2(id|i|d)\$/.test(valor);
}

/**
 * Verifica la clave contra un hash argon2. Nunca compara texto plano: si el
 * valor guardado no es un hash argon2 (o esta corrupto) devuelve `false`.
 */
export async function verificarClave(
  hashGuardado: string | null | undefined,
  clave: string,
): Promise<boolean> {
  if (!esHashArgon2(hashGuardado)) return false;
  try {
    return await verify(hashGuardado, clave);
  } catch {
    return false;
  }
}

let hashFicticio: Promise<string> | undefined;

/**
 * Hash de una clave aleatoria, para verificar contra el cuando el usuario no
 * existe (o su clave no es valida) y no delatarlo por el tiempo de respuesta.
 */
export function obtenerHashFicticio(): Promise<string> {
  hashFicticio ??= hashClave(randomBytes(32).toString('hex'));
  return hashFicticio;
}
