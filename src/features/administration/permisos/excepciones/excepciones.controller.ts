import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
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
import type { AuthUser } from '../../../../platform/auth/auth-user.js';
import { CurrentUser } from '../../../../platform/auth/current-user.decorator.js';
import { Modulo } from '../../../../platform/auth/permisos.decorator.js';
import { ActualizarExcepcionesDto, PermisosUsuarioDto } from './excepciones.dto.js';
import { ExcepcionesPermisosHandler } from './excepciones.handler.js';

@ApiTags('administration/permisos')
@Controller('administration/usuarios/:id/permisos')
@Modulo('admin.usuarios')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Sin permiso en Usuarios (403 SIN_PERMISO), usuario desactivado o quien cambia no es Administrador' })
export class ExcepcionesPermisosController {
  constructor(private readonly handler: ExcepcionesPermisosHandler) {}

  @Get()
  @ApiOperation({
    summary: 'Permisos de un usuario módulo por módulo (rol → área → excepción)',
    description:
      'Una entrada por módulo activo con lo que da el rol, lo que queda tras el área, la excepción del usuario (si la tiene), ' +
      'el permiso efectivo y su origen. Sirve para responder "¿por qué puede?".',
  })
  @ApiParam({ name: 'id', example: 'USR-0001' })
  @ApiOkResponse({ type: PermisosUsuarioDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  obtener(@Param('id') id: string): Promise<PermisosUsuarioDto> {
    return this.handler.obtener(id);
  }

  @Put()
  @ApiOperation({
    summary: 'Reemplazar las excepciones de permisos de un usuario',
    description:
      'Solo el Administrador. Reemplaza todas las excepciones en una transacción: cada entrada sustituye el módulo completo para ese usuario ' +
      '(concede o quita) y los módulos sin entrada conservan lo que dan su rol y su área. No admite módulos de Administración.',
  })
  @ApiParam({ name: 'id', example: 'USR-0001' })
  @ApiOkResponse({ type: PermisosUsuarioDto, description: 'Permisos ya con las excepciones aplicadas' })
  @ApiBadRequestResponse({ description: 'Cuerpo inválido, módulo desconocido/repetido/de Administración, o acción sin Ver / no admitida' })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  @ApiConflictResponse({ description: 'Es uno mismo o el usuario tiene rol Administrador' })
  reemplazar(
    @Param('id') id: string,
    @Body() dto: ActualizarExcepcionesDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PermisosUsuarioDto> {
    return this.handler.reemplazar(id, dto.excepciones, actor);
  }

  @Delete()
  @ApiOperation({ summary: 'Restablecer: quitar todas las excepciones del usuario' })
  @ApiParam({ name: 'id', example: 'USR-0001' })
  @ApiOkResponse({ type: PermisosUsuarioDto })
  @ApiNotFoundResponse({ description: 'Usuario no encontrado' })
  @ApiConflictResponse({ description: 'Es uno mismo o el usuario tiene rol Administrador' })
  restablecer(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<PermisosUsuarioDto> {
    return this.handler.restablecer(id, actor);
  }
}
