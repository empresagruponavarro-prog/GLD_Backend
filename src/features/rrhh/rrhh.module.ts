import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CatalogoController } from './catalogo/catalogo.controller.js';
import { CatalogoHandler } from './catalogo/catalogo.handler.js';
import { TrabajadorController } from './trabajador/trabajador.controller.js';
import { TrabajadorHandler } from './trabajador/trabajador.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [TrabajadorController, CatalogoController],
  providers: [TrabajadorHandler, CatalogoHandler],
})
export class RrhhModule {}
