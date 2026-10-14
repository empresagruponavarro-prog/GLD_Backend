import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../platform/auth/auth-user.js';
import { CurrentUser } from '../../../platform/auth/current-user.decorator.js';
import { UsuarioSesionDto } from '../shared/usuario-sesion.dto.js';
import { MeHandler } from './me.handler.js';

@ApiTags('auth')
@Controller('auth')
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
