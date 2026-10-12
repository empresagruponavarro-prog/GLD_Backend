import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CronogramaController } from './cronograma/cronograma.controller.js';
import { CronogramaHandler } from './cronograma/cronograma.handler.js';
import { DocumentosObraController } from './documentos/documentos.controller.js';
import { DocumentosHandler } from './documentos/documentos.handler.js';
import { IncidenciasObraController } from './incidencias/incidencias.controller.js';
import { ObraIncidenciasHandler } from './incidencias/incidencias.handler.js';
import { ObraController } from './obra/obra.controller.js';
import { ObraHandler } from './obra/obra.handler.js';
import { PlanosController } from './planos/planos.controller.js';
import { PlanosHandler } from './planos/planos.handler.js';
import { ResidentesController } from './residentes/residentes.controller.js';
import { ResidentesHandler } from './residentes/residentes.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    ObraController,
    CronogramaController,
    ResidentesController,
    PlanosController,
    DocumentosObraController,
    IncidenciasObraController,
  ],
  providers: [ObraHandler, CronogramaHandler, ResidentesHandler, PlanosHandler, DocumentosHandler, ObraIncidenciasHandler],
})
export class OperacionesObraModule {}
