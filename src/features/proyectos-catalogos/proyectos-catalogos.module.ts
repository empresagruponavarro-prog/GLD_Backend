import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PeriodoFiscalController } from './periodo-fiscal/periodo-fiscal.controller.js';
import { PeriodoFiscalHandler } from './periodo-fiscal/periodo-fiscal.handler.js';
import { TipoPlanoController } from './tipo-plano/tipo-plano.controller.js';
import { TipoPlanoHandler } from './tipo-plano/tipo-plano.handler.js';
import { TipoProyectoController } from './tipo-proyecto/tipo-proyecto.controller.js';
import { TipoProyectoHandler } from './tipo-proyecto/tipo-proyecto.handler.js';

/** Catálogos de proyecto (GRP): tipos de proyecto, tipos de plano y años fiscales. */
@Module({
  imports: [PrismaModule],
  controllers: [TipoProyectoController, TipoPlanoController, PeriodoFiscalController],
  providers: [TipoProyectoHandler, TipoPlanoHandler, PeriodoFiscalHandler],
  exports: [TipoProyectoHandler, PeriodoFiscalHandler],
})
export class ProyectosCatalogosModule {}
