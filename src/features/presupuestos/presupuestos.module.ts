import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AlmacenModule } from '../almacen/almacen.module.js';
import { AprobacionPresupuestoController } from './aprobacion/aprobacion.controller.js';
import { AprobacionPresupuestoHandler } from './aprobacion/aprobacion.handler.js';
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
import { SubfasesController } from './subfases/subfases.controller.js';
import { SubfasesHandler } from './subfases/subfases.handler.js';
import { PresupuestoPrincipalController } from './presupuesto-principal/presupuesto-principal.controller.js';
import { PresupuestoPrincipalHandler } from './presupuesto-principal/presupuesto-principal.handler.js';

import { AplicarPlantillaController } from './plantillas/aplicar-plantilla.controller.js';
import { PlantillasController } from './plantillas/plantillas.controller.js';
import { PlantillasHandler } from './plantillas/plantillas.handler.js';
import { PlantillasItemsController } from './plantillas-items/plantillas-items.controller.js';
import { PlantillasItemsHandler } from './plantillas-items/plantillas-items.handler.js';
import { PptoDetalleItemsController } from './detalle-items/detalle-items.controller.js';
import { PptoDetalleItemsHandler } from './detalle-items/detalle-items.handler.js';

@Module({
  imports: [PrismaModule, AlmacenModule],
  controllers: [
    PptoFasesController,
    PptoFasesCategoriasController,
    PptoDetalleFasesController,
    PptoDetalleFasesCateController,
    PresupuestoHistorialController,
    PresupuestoPrincipalController,
    AprobacionPresupuestoController,
    SubfasesController,
    PlantillasController,
    AplicarPlantillaController,
    PlantillasItemsController,
    PptoDetalleItemsController,
  ],
  providers: [
    PresupuestoPrincipalHandler,
    AprobacionPresupuestoHandler,
    SubfasesHandler,
    PptoFasesHandler,
    PptoFasesCategoriasHandler,
    PptoDetalleFasesHandler,
    PptoDetalleFasesCateHandler,
    PresupuestoHistorialHandler,
    PlantillasHandler,
    PlantillasItemsHandler,
    PptoDetalleItemsHandler,
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
