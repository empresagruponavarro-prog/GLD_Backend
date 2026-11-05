import { SetMetadata } from '@nestjs/common';
import { CAMPOS_SIN_MAYUSCULAS } from './mayusculas.js';

export const SIN_MAYUSCULAS_KEY = 'http:sinMayusculas';

/**
 * En una clase o un método de controlador: el cuerpo de esas rutas **no** se convierte a mayúsculas (login, permisos, roles y
 * usuarios: llevan nombres de rol, claves de módulo y credenciales que se comparan tal cual).
 */
export const SinMayusculas = (): ClassDecorator & MethodDecorator => SetMetadata(SIN_MAYUSCULAS_KEY, true);

/**
 * En una propiedad de un DTO: su valor no se convierte a mayúsculas (p. ej. `TipoPpto`, que se compara como «Principal» o
 * «Adicional»). Rige para toda propiedad con ese nombre en cualquier cuerpo.
 */
export const SinMayusculasCampo = (): PropertyDecorator => (_target, propiedad) => {
  if (typeof propiedad === 'string') CAMPOS_SIN_MAYUSCULAS.add(propiedad);
};
