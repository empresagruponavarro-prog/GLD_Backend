import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdministrationModule } from './features/administration/administration.module.js';
import { AlmacenModule } from './features/almacen/almacen.module.js';
import { CentrosCostosModule } from './features/centros-costos/centros-costos.module.js';
import { DocumentosModule } from './features/documentos/documentos.module.js';
import { MaestrosModule } from './features/maestros/maestros.module.js';
import { IncidenciasModule } from './features/incidencias/incidencias.module.js';
import { PresupuestosModule } from './features/presupuestos/presupuestos.module.js';
import { OperacionesObraModule } from './features/operaciones-obra/operaciones-obra.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    AdministrationModule,
    AlmacenModule,
    CentrosCostosModule,
    DocumentosModule,
    MaestrosModule,
    PresupuestosModule,
    IncidenciasModule,
    OperacionesObraModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
