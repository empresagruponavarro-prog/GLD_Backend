import { SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { esAccion, esClaveModulo, type Accion as AccionPermiso, type ClaveModulo } from './permisos.js';

export const MODULO_KEY = 'permisos:modulo';
export const ACCION_KEY = 'permisos:accion';
export const LECTURA_COMPARTIDA_KEY = 'permisos:lecturaCompartida';
export const TAMBIEN_DESDE_KEY = 'permisos:tambienDesde';

/** Clase o método sobre el que se leen metadatos (lo que acepta `Reflector.get`). */
type Objetivo = Parameters<Reflector['get']>[1];

/**
 * Módulo del catálogo (`modulo.clave`) al que pertenece TODO el controlador. Va una sola vez, a
 * nivel de clase; lo evalúa `PermisosGuard` (plan 05 §7).
 */
export const Modulo = (clave: ClaveModulo): ClassDecorator => SetMetadata(MODULO_KEY, clave);

/**
 * Acción que exige un método cuando no es la deducida del verbo HTTP (GET/HEAD → ver,
 * POST → crear, PUT/PATCH → editar, DELETE → eliminar): aprobar, anular, o una acción CRUD
 * distinta (p. ej. un POST que en realidad edita).
 */
export const Accion = (accion: AccionPermiso): MethodDecorator => SetMetadata(ACCION_KEY, accion);

/**
 * Lectura de un catálogo que usan formularios de OTROS módulos (selects, buscadores): solo exige
 * sesión (D7). En un método o, si todo el controlador es catálogo compartido, en la clase.
 */
export const LecturaCompartida = () => SetMetadata(LECTURA_COMPARTIDA_KEY, true);

/**
 * Módulos ALTERNATIVOS desde los que también se acepta la acción de un método ("con acceso a la
 * pantalla basta"): una pantalla de otro módulo necesita este endpoint. `PermisosGuard` exige la
 * acción en el `@Modulo` de la clase y, si falta, la MISMA acción (módulo activo) en alguno de
 * estos. Solo a nivel de método; no debe repetir el módulo de la clase.
 */
export const TambienDesde = (...claves: ClaveModulo[]): MethodDecorator =>
  SetMetadata(TAMBIEN_DESDE_KEY, Object.freeze([...claves]));

/** `@Modulo` de la clase, validado contra `CLAVES_MODULO` (`undefined` si falta o es inválido). */
export function moduloDeClase(reflector: Reflector, clase: Objetivo): ClaveModulo | undefined {
  const valor = reflector.get<unknown>(MODULO_KEY, clase);
  return typeof valor === 'string' && esClaveModulo(valor) ? valor : undefined;
}

/** `@Accion` del método (`undefined` si no tiene o el valor no es una acción). */
export function accionDeMetodo(reflector: Reflector, handler: Objetivo): AccionPermiso | undefined {
  const valor = reflector.get<unknown>(ACCION_KEY, handler);
  return typeof valor === 'string' && esAccion(valor) ? valor : undefined;
}

/** `@TambienDesde` del método: solo las claves válidas (vacío si no tiene). */
export function tambienDesdeDeMetodo(reflector: Reflector, handler: Objetivo): ClaveModulo[] {
  const valor = reflector.get<unknown>(TAMBIEN_DESDE_KEY, handler);
  if (!Array.isArray(valor)) return [];
  const lista: readonly unknown[] = valor;
  return lista.filter((v): v is ClaveModulo => typeof v === 'string' && esClaveModulo(v));
}
