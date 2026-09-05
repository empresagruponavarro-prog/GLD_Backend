import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { IncidenciaController } from './incidencia/incidencia.controller.js';
import { IncidenciaHandler } from './incidencia/incidencia.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [IncidenciaController],
  providers: [IncidenciaHandler],
})
export class IncidenciasModule {}