import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MayusculasInterceptor } from './platform/http/mayusculas.interceptor.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdministrationModule } from './features/administration/administration.module.js';
import { AlmacenModule } from './features/almacen/almacen.module.js';
import { AuthModule } from './features/auth/auth.module.js';
import { CentrosCostosModule } from './features/centros-costos/centros-costos.module.js';
import { DocumentosModule } from './features/documentos/documentos.module.js';
import { MaestrosModule } from './features/maestros/maestros.module.js';
import { IncidenciasModule } from './features/incidencias/incidencias.module.js';
import { PresupuestosModule } from './features/presupuestos/presupuestos.module.js';
import { RequerimientosModule } from './features/requerimientos/requerimientos.module.js';
import { OperacionesObraModule } from './features/operaciones-obra/operaciones-obra.module.js';
import { ProyectosCatalogosModule } from './features/proyectos-catalogos/proyectos-catalogos.module.js';
import { TesoreriaModule } from './features/tesoreria/tesoreria.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RrhhModule } from './features/rrhh/rrhh.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AdministrationModule,
    AlmacenModule,
    CentrosCostosModule,
    DocumentosModule,
    RequerimientosModule,
    TesoreriaModule,
    MaestrosModule,
    PresupuestosModule,
    IncidenciasModule,
    OperacionesObraModule,
    ProyectosCatalogosModule,
    RrhhModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_INTERCEPTOR, useClass: MayusculasInterceptor }],
})
export class AppModule {}
