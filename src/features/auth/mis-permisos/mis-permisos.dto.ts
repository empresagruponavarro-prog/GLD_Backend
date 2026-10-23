import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type { ClaveModulo, Permisos } from '../../../platform/auth/permisos/permisos.js';

/** Acciones de un módulo (`Permisos`). */
export class PermisosDto implements Permisos {
  @ApiProperty({ example: true })
  ver: boolean;

  @ApiProperty({ example: true })
  crear: boolean;

  @ApiProperty({ example: true })
  editar: boolean;

  @ApiProperty({ example: false })
  eliminar: boolean;

  @ApiProperty({ example: false })
  aprobar: boolean;

  @ApiProperty({ example: false })
  anular: boolean;
}

export class MisPermisosDto {
  @ApiProperty({ example: 'Promotor', description: "Rol vigente del usuario ('' si no tiene)" })
  rol: string;

  @ApiProperty({ example: false, description: 'Rol de sistema: tiene todos los permisos' })
  esAdministrador: boolean;

  @ApiProperty({
    type: 'object',
    description: 'Un objeto por cada `ClaveModulo` (todas presentes; false si no tiene permiso)',
    additionalProperties: { $ref: getSchemaPath(PermisosDto) },
    example: {
      'tesoreria.pagos': { ver: true, crear: true, editar: true, eliminar: true, aprobar: false, anular: true },
    },
  })
  permisos: Record<ClaveModulo, Permisos>;
}
