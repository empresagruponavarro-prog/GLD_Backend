import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { UsuarioSesionDto } from '../shared/usuario-sesion.dto.js';
import { MeHandler } from './me.handler.js';
import { LecturaCompartida } from '../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('auth')
@Controller('auth')
@LecturaCompartida()
export class MeController {
  constructor(private readonly handler: MeHandler) {}

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario de la sesión actual (leído de la BD)' })
  @ApiOkResponse({ type: UsuarioSesionDto })
  @ApiUnauthorizedResponse({ description: 'Token ausente, inválido, expirado o usuario borrado' })
  me(@CurrentUser() user: AuthUser): Promise<UsuarioSesionDto> {
    return this.handler.me(user.id);
  }
}
