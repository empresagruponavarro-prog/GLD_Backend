import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AlmacenModule } from '../almacen/almacen.module.js';
import { ConsultaController } from './consulta/consulta.controller.js';
import { ConsultaHandler } from './consulta/consulta.handler.js';
import { CuentasController } from './cuentas/cuentas.controller.js';
import { CuentasHandler } from './cuentas/cuentas.handler.js';
import { PagosController } from './pagos/pagos.controller.js';
import { PagosHandler } from './pagos/pagos.handler.js';
import { ProgramacionController } from './programacion/programacion.controller.js';
import { ProgramacionHandler } from './programacion/programacion.handler.js';
import { TipoCambioController } from './tipo-cambio/tipo-cambio.controller.js';
import { TipoCambioHandler } from './tipo-cambio/tipo-cambio.handler.js';

@Module({
  imports: [PrismaModule, AlmacenModule],
  controllers: [CuentasController, TipoCambioController, ProgramacionController, PagosController, ConsultaController],
  providers: [CuentasHandler, TipoCambioHandler, ProgramacionHandler, PagosHandler, ConsultaHandler],
})
export class TesoreriaModule {}
