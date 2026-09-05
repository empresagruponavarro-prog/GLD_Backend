import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { EmpresaController } from './empresa/empresa.controller.js';
import { EmpresaHandler } from './empresa/empresa.handler.js';
import { UsuarioController } from './usuario/usuario.controller.js';
import { UsuarioHandler } from './usuario/usuario.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [EmpresaController, UsuarioController],
  providers: [EmpresaHandler, UsuarioHandler],
})
export class AdministrationModule {}