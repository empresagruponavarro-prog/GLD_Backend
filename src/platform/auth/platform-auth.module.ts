import { Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuditoriaPermisosService } from './auditoria-permisos.js';
import { jwtModuleOptions } from './jwt.config.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PermisosGuard } from './permisos.guard.js';
import { PermisosRolService } from './permisos-rol.js';
import { SesionUsuariosService } from './sesion-usuarios.js';

/**
 * Guards globales, en este orden: primero se exige un JWT valido (salvo `@Public()`) y despues
 * `PermisosGuard` evalua `@Modulo`/`@Accion`/`@LecturaCompartida` con el usuario ya autenticado.
 */
export const GUARDS_GLOBALES: Provider[] = [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: PermisosGuard },
];

/**
 * JWT + guards de autenticacion/autorizacion. Toda la API exige `Authorization: Bearer`
 * salvo las rutas marcadas con `@Public()` (login y health). `JwtAuthGuard` valida en cada
 * peticion que el usuario exista y este activo (`SesionUsuariosService`, cache corta) y
 * `PermisosGuard` aplica los permisos del rol por modulo (`PermisosRolService`, cache 30 s).
 */
@Module({
  imports: [PrismaModule, JwtModule.registerAsync({ useFactory: () => jwtModuleOptions() })],
  providers: [
    SesionUsuariosService,
    PermisosRolService,
    AuditoriaPermisosService,
    JwtAuthGuard,
    ...GUARDS_GLOBALES,
  ],
  exports: [JwtModule, JwtAuthGuard, SesionUsuariosService, PermisosRolService, AuditoriaPermisosService],
})
export class PlatformAuthModule {}
