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
import { ImportacionController } from './importacion/importacion.controller.js';
import { ImportacionHandler } from './importacion/importacion.handler.js';
import { AvisosController } from './avisos/avisos.controller.js';
import { AvisosHandler } from './avisos/avisos.handler.js';
import { AvanceController } from './avance/avance.controller.js';
import { AlmacenModule } from '../almacen/almacen.module.js';
import { AvanceHandler } from './avance/avance.handler.js';
import { ControlController } from './control/control.controller.js';
import { ControlHandler } from './control/control.handler.js';
import { EstadoController } from './estado/estado.controller.js';
import { EstadoHandler } from './estado/estado.handler.js';
import { ImportarPresupuestoHandler } from './partidas/importar-presupuesto.handler.js';
import { GastoController } from './gasto/gasto.controller.js';
import { GastoHandler } from './gasto/gasto.handler.js';
import { LiquidacionController } from './liquidacion/liquidacion.controller.js';
import { LiquidacionHandler } from './liquidacion/liquidacion.handler.js';
import { PlanosRequeridosController } from './planos-requeridos/planos-requeridos.controller.js';
import { PlanosRequeridosHandler } from './planos-requeridos/planos-requeridos.handler.js';
import { PartidasController } from './partidas/partidas.controller.js';
import { PartidasHandler } from './partidas/partidas.handler.js';
import { PortafolioController } from './portafolio/portafolio.controller.js';
import { PortafolioHandler } from './portafolio/portafolio.handler.js';
import { ReprogramacionesController } from './reprogramaciones/reprogramaciones.controller.js';
import { ReprogramacionesHandler } from './reprogramaciones/reprogramaciones.handler.js';

@Module({
  imports: [PrismaModule, AlmacenModule],
  controllers: [
    ObraController,
    CronogramaController,
    ResidentesController,
    PlanosController,
    DocumentosObraController,
    IncidenciasObraController,
    // Control de avance (Dashboard de Operaciones)
    EstadoController,
    PartidasController,
    AvanceController,
    ReprogramacionesController,
    ControlController,
    // Dashboard de Operaciones: vistas con todas las obras (módulo de permisos `operaciones`)
    PortafolioController,
    AvisosController,
    ImportacionController,
    // GRP: lista de verificación de planos de la obra
    PlanosRequeridosController,
    LiquidacionController,
    GastoController,
  ],
  providers: [
    ObraHandler,
    CronogramaHandler,
    ResidentesHandler,
    PlanosHandler,
    DocumentosHandler,
    ObraIncidenciasHandler,
    EstadoHandler,
    PartidasHandler,
    ImportarPresupuestoHandler,
    AvanceHandler,
    ReprogramacionesHandler,
    ControlHandler,
    PortafolioHandler,
    AvisosHandler,
    ImportacionHandler,
    PlanosRequeridosHandler,
    LiquidacionHandler,
    GastoHandler,
  ],
})
export class OperacionesObraModule {}
