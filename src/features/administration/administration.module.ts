import { Module } from '@nestjs/common';
import { PlatformAuthModule } from '../../platform/auth/platform-auth.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { EmpresaController } from './empresa/empresa.controller.js';
import { EmpresaHandler } from './empresa/empresa.handler.js';
import { AuditoriaPermisosController } from './permisos/auditoria/auditoria.controller.js';
import { AuditoriaPermisosHandler } from './permisos/auditoria/auditoria.handler.js';
import { CatalogoPermisosController } from './permisos/catalogo/catalogo.controller.js';
import { CatalogoPermisosHandler } from './permisos/catalogo/catalogo.handler.js';
import { MatrizPermisosController } from './permisos/matriz/matriz.controller.js';
import { MatrizPermisosHandler } from './permisos/matriz/matriz.handler.js';
import { RolController } from './rol/rol.controller.js';
import { RolHandler } from './rol/rol.handler.js';
import { UsuarioController } from './usuario/usuario.controller.js';
import { UsuarioHandler } from './usuario/usuario.handler.js';

@Module({
  imports: [PrismaModule, PlatformAuthModule],
  controllers: [
    EmpresaController,
    UsuarioController,
    RolController,
    CatalogoPermisosController,
    MatrizPermisosController,
    AuditoriaPermisosController,
  ],
  providers: [
    EmpresaHandler,
    UsuarioHandler,
    RolHandler,
    CatalogoPermisosHandler,
    MatrizPermisosHandler,
    AuditoriaPermisosHandler,
  ],
})
export class AdministrationModule {}