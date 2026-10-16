import { ForbiddenException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import type { Accion } from './permisos.js';

export const CODIGO_SIN_PERMISO = 'SIN_PERMISO';
export const CODIGO_RUTA_SIN_MODULO = 'RUTA_SIN_MODULO';
export const RUTA_SIN_MODULO = 'Esta operación no tiene permisos configurados. Contacta al administrador';

/** Cuerpo del 403 de `PermisosGuard` cuando el rol no tiene la acción en el módulo. */
export class SinPermisoErrorDto {
  @ApiProperty({ example: 403 })
  statusCode: number;

  @ApiProperty({ example: 'No tienes permiso para crear en Ejecución de pagos' })
  message: string;

  @ApiProperty({ example: 'Forbidden' })
  error: string;

  @ApiProperty({ example: CODIGO_SIN_PERMISO })
  codigo: string;

  @ApiProperty({ example: 'tesoreria.pagos', description: 'Clave del módulo (`modulo.clave`)' })
  modulo: string;

  @ApiProperty({ example: 'crear', enum: ['ver', 'crear', 'editar', 'eliminar', 'aprobar', 'anular'] })
  accion: string;
}

export function sinPermiso(accion: Accion, nombreModulo: string, clave: string): ForbiddenException {
  const cuerpo: SinPermisoErrorDto = {
    statusCode: 403,
    message: `No tienes permiso para ${accion} en ${nombreModulo}`,
    error: 'Forbidden',
    codigo: CODIGO_SIN_PERMISO,
    modulo: clave,
    accion,
  };
  return new ForbiddenException(cuerpo);
}

/** Ruta sin `@Modulo`/`@LecturaCompartida`/`@Public`: error de configuración, se niega siempre. */
export function rutaSinModulo(): ForbiddenException {
  return new ForbiddenException({
    statusCode: 403,
    message: RUTA_SIN_MODULO,
    error: 'Forbidden',
    codigo: CODIGO_RUTA_SIN_MODULO,
  });
}
