import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { UsuarioInactivoErrorDto } from '../../../platform/auth/usuarios/usuario-inactivo.js';
import { MisPermisosDto, PermisosDto } from './mis-permisos.dto.js';
import { MisPermisosHandler } from './mis-permisos.handler.js';
import { LecturaCompartida } from '../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('auth')
@ApiExtraModels(PermisosDto)
@Controller('auth')
@LecturaCompartida()
export class MisPermisosController {
  constructor(private readonly handler: MisPermisosHandler) {}

  @Get('mis-permisos')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Permisos del usuario de la sesión (leídos de la BD)',
    description: 'Solo exige sesión. El Administrador tiene todo (aprobar/anular solo donde el módulo lo admite).',
  })
  @ApiOkResponse({ type: MisPermisosDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido, expirado o usuario borrado' })
  @ApiForbiddenResponse({ type: UsuarioInactivoErrorDto, description: 'Usuario desactivado' })
  misPermisos(@CurrentUser() user: AuthUser): Promise<MisPermisosDto> {
    return this.handler.misPermisos(user);
  }
}
