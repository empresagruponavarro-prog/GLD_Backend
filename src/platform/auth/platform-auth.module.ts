import { Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { jwtModuleOptions } from './jwt.config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

/**
 * Guards globales, en este orden: primero se exige un JWT valido (salvo `@Public()`)
 * y despues se evalua `@Roles(...)` con el usuario ya autenticado.
 */
export const GUARDS_GLOBALES: Provider[] = [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
];

/**
 * JWT + guards de autenticacion/autorizacion. Toda la API exige `Authorization: Bearer`
 * salvo las rutas marcadas con `@Public()` (login y health).
 */
@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => jwtModuleOptions() })],
  providers: [JwtAuthGuard, RolesGuard, ...GUARDS_GLOBALES],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class PlatformAuthModule {}
