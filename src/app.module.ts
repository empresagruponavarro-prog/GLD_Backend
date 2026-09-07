import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CentrosCostosModule } from './features/centros-costos/centros-costos.module.js';
import { PresupuestosModule } from './features/presupuestos/presupuestos.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    CentrosCostosModule,
    PresupuestosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

