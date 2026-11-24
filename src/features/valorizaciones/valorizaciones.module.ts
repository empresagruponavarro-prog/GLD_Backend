import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AlmacenModule } from '../almacen/almacen.module.js';
import { ValorizacionesAdministracionController } from './administracion/administracion.controller.js';
import { CondicionesHandler } from './condiciones/condiciones.handler.js';
import { ConsultaValorizacionesHandler } from './consulta/consulta.handler.js';
import { ContratosController } from './contratos/contratos.controller.js';
import { ContratosHandler } from './contratos/contratos.handler.js';
import { DeductivosController } from './deductivos/deductivos.controller.js';
import { DeductivosHandler } from './deductivos/deductivos.handler.js';
import { ValorizacionController } from './valorizacion/valorizacion.controller.js';
import { ValorizacionHandler } from './valorizacion/valorizacion.handler.js';

/**
 * Valorizaciones de contratistas (plan 12). `AlmacenSql` y `InventarioLedger` salen del módulo global de almacén/BD; las funciones libres
 * de `shared/` (alta de contrato, guardas) las usan `presupuestos`, `documentos` y `almacen` sin importar este módulo.
 */
@Module({
  imports: [PrismaModule, AlmacenModule],
  controllers: [ContratosController, ValorizacionController, DeductivosController, ValorizacionesAdministracionController],
  providers: [ContratosHandler, ValorizacionHandler, DeductivosHandler, CondicionesHandler, ConsultaValorizacionesHandler],
})
export class ValorizacionesModule {}
