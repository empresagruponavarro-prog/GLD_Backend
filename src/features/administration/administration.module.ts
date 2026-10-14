import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { EmpresaController } from './empresa/empresa.controller.js';
import { EmpresaHandler } from './empresa/empresa.handler.js';
import { RolController } from './rol/rol.controller.js';
import { RolHandler } from './rol/rol.handler.js';
import { UsuarioController } from './usuario/usuario.controller.js';
import { UsuarioHandler } from './usuario/usuario.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [EmpresaController, UsuarioController, RolController],
  providers: [EmpresaHandler, UsuarioHandler, RolHandler],
})
export class AdministrationModule {}