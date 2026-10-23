import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ActualizarPermisosDto, MatrizPermisosDto } from './matriz.dto.js';
import { MatrizPermisosHandler } from './matriz.handler.js';
import { Modulo } from '../../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('administration/permisos')
@Controller('administration/roles')
@Modulo('admin.roles')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Sin permiso en Roles y permisos (403 SIN_PERMISO) o usuario desactivado' })
export class MatrizPermisosController {
  constructor(private readonly handler: MatrizPermisosHandler) {}

  @Get(':id/permisos')
  @ApiOperation({
    summary: 'Matriz de permisos de un rol',
    description:
      'Una entrada por módulo activo (false si no hay nada guardado). El Administrador tiene todo (aprobar/anular solo donde el módulo lo admite) y `bloqueado: true`.',
  })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiOkResponse({ type: MatrizPermisosDto })
  @ApiBadRequestResponse({ description: 'id no numérico' })
  @ApiNotFoundResponse({ description: 'Rol no encontrado' })
  obtener(@Param('id', ParseIntPipe) id: number): Promise<MatrizPermisosDto> {
    return this.handler.obtener(id);
  }

  @Put(':id/permisos')
  @ApiOperation({
    summary: 'Reemplazar la matriz de permisos de un rol',
    description:
      'Reemplaza la matriz completa en una transacción. Debe traer exactamente una entrada por módulo activo. Responde igual que el GET.',
  })
  @ApiParam({ name: 'id', type: Number, example: 2 })
  @ApiOkResponse({ type: MatrizPermisosDto, description: 'Matriz guardada' })
  @ApiBadRequestResponse({
    description:
      'id no numérico, cuerpo inválido, módulos faltantes/repetidos/desconocidos, aprobar/anular en un módulo que no lo admite o una acción marcada sin Ver (detalle en `message`)',
  })
  @ApiNotFoundResponse({ description: 'Rol no encontrado' })
  @ApiConflictResponse({ description: 'El rol "Administrador" tiene todos los permisos y no se puede modificar' })
  reemplazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarPermisosDto,
  ): Promise<MatrizPermisosDto> {
    return this.handler.reemplazar(id, dto.permisos);
  }
}
