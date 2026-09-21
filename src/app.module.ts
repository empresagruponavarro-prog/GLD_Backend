import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdministrationModule } from './features/administration/administration.module.js';
import { CentrosCostosModule } from './features/centros-costos/centros-costos.module.js';
import { DocumentosModule } from './features/documentos/documentos.module.js';
import { MaestrosModule } from './features/maestros/maestros.module.js';
import { PresupuestosModule } from './features/presupuestos/presupuestos.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    AdministrationModule,
    CentrosCostosModule,
    DocumentosModule,
    MaestrosModule,
    PresupuestosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

