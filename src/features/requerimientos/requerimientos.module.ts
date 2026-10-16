import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AlmacenModule } from '../almacen/almacen.module.js';
import { CotizacionController } from './cotizaciones/cotizacion.controller.js';
import { CotizacionHandler } from './cotizaciones/cotizacion.handler.js';
import { FlujoAprobacionController } from './flujo/flujo-aprobacion.controller.js';
import { FlujoController } from './flujo/flujo.controller.js';
import { FlujoHandler } from './flujo/flujo.handler.js';
import { RequerimientoController } from './requerimiento/requerimiento.controller.js';
import { RequerimientoHandler } from './requerimiento/requerimiento.handler.js';

@Module({
  imports: [PrismaModule, AlmacenModule],
  controllers: [RequerimientoController, FlujoController, FlujoAprobacionController, CotizacionController],
  providers: [RequerimientoHandler, FlujoHandler, CotizacionHandler],
  exports: [RequerimientoHandler, CotizacionHandler],
})
export class RequerimientosModule {}
