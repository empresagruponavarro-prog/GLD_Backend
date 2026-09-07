import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PptoDetalleFasesCateController } from './detalle-fases-cate/detalle-fases-cate.controller.js';
import { PptoDetalleFasesCateHandler } from './detalle-fases-cate/detalle-fases-cate.handler.js';
import { PptoDetalleFasesController } from './detalle-fases/detalle-fases.controller.js';
import { PptoDetalleFasesHandler } from './detalle-fases/detalle-fases.handler.js';
import { PptoFasesCategoriasController } from './fases-categorias/fases-categorias.controller.js';
import { PptoFasesCategoriasHandler } from './fases-categorias/fases-categorias.handler.js';
import { PptoFasesController } from './fases/fases.controller.js';
import { PptoFasesHandler } from './fases/fases.handler.js';
import { PresupuestoHistorialController } from './presupuesto-historial/presupuesto-historial.controller.js';
import { PresupuestoHistorialHandler } from './presupuesto-historial/presupuesto-historial.handler.js';
import { PresupuestoPrincipalController } from './presupuesto-principal/presupuesto-principal.controller.js';
import { PresupuestoPrincipalHandler } from './presupuesto-principal/presupuesto-principal.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    PresupuestoPrincipalController,
    PptoFasesController,
    PptoFasesCategoriasController,
    PptoDetalleFasesController,
    PptoDetalleFasesCateController,
    PresupuestoHistorialController,
  ],
  providers: [
    PresupuestoPrincipalHandler,
    PptoFasesHandler,
    PptoFasesCategoriasHandler,
    PptoDetalleFasesHandler,
    PptoDetalleFasesCateHandler,
    PresupuestoHistorialHandler,
  ],
  exports: [
    PresupuestoPrincipalHandler,
    PptoFasesHandler,
    PptoFasesCategoriasHandler,
    PptoDetalleFasesHandler,
    PptoDetalleFasesCateHandler,
    PresupuestoHistorialHandler,
  ],
})
export class PresupuestosModule {}
