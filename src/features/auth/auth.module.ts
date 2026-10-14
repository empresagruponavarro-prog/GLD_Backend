import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PlatformAuthModule } from '../../platform/auth/platform-auth.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { LoginController } from './login/login.controller.js';
import { LoginHandler } from './login/login.handler.js';
import { MeController } from './me/me.controller.js';
import { MeHandler } from './me/me.handler.js';

export const LOGIN_INTENTOS_POR_MINUTO = 5;
export const DEMASIADOS_INTENTOS = 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';

@Module({
  imports: [
    PrismaModule,
    PlatformAuthModule,
    // Solo lo usa `LoginController` (`@UseGuards(ThrottlerGuard)`); no es global.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'login', ttl: 60_000, limit: LOGIN_INTENTOS_POR_MINUTO }],
      errorMessage: DEMASIADOS_INTENTOS,
    }),
  ],
  controllers: [LoginController, MeController],
  providers: [LoginHandler, MeHandler],
})
export class AuthModule {}
