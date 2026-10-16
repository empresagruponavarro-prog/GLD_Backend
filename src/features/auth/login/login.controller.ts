import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoginDto, LoginResponseDto } from './login.dto.js';
import { LoginHandler } from './login.handler.js';
import { Public } from '../../../platform/auth/public.decorator.js';
import { UsuarioInactivoErrorDto } from '../../../platform/auth/usuario-inactivo.js';

@ApiTags('auth')
@Controller('auth')
@Public()
@UseGuards(ThrottlerGuard)
export class LoginController {
  constructor(private readonly handler: LoginHandler) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión (devuelve un JWT válido por 8 h)' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Cuerpo inválido' })
  @ApiUnauthorizedResponse({ description: 'Usuario o contraseña incorrectos' })
  @ApiForbiddenResponse({
    type: UsuarioInactivoErrorDto,
    description: 'Usuario desactivado (solo si la clave es correcta; `codigo: USUARIO_INACTIVO`)',
  })
  @ApiTooManyRequestsResponse({ description: 'Más de 5 intentos por minuto desde la misma IP' })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.handler.login(dto);
  }
}
