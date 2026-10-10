import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AlmacenModule } from '../almacen/almacen.module.js';
import { FlujoController } from './flujo/flujo.controller.js';
import { FlujoHandler } from './flujo/flujo.handler.js';
import { RequerimientoController } from './requerimiento/requerimiento.controller.js';
import { RequerimientoHandler } from './requerimiento/requerimiento.handler.js';

@Module({
  imports: [PrismaModule, AlmacenModule],
  controllers: [RequerimientoController, FlujoController],
  providers: [RequerimientoHandler, FlujoHandler],
})
export class RequerimientosModule {}
