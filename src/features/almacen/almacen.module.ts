import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AlmacenController } from './almacenes/almacen.controller.js';
import { AlmacenHandler } from './almacenes/almacen.handler.js';
import { ConsultaController } from './consulta/consulta.controller.js';
import { ConsultaHandler } from './consulta/consulta.handler.js';
import { DocumentoHandler } from './documentos/documento.handler.js';
import { IngresosController } from './documentos/ingresos.controller.js';
import { InventarioInicialController } from './documentos/inventario-inicial.controller.js';
import { SalidasController } from './documentos/salidas.controller.js';
import { TransferenciasController } from './documentos/transferencias.controller.js';
import { KardexController } from './kardex/kardex.controller.js';
import { KardexHandler } from './kardex/kardex.handler.js';
import { RecepcionController } from './recepciones/recepcion.controller.js';
import { RecepcionHandler } from './recepciones/recepcion.handler.js';
import { PrestamoController } from './prestamos/prestamo.controller.js';
import { PrestamoHandler } from './prestamos/prestamo.handler.js';
import { AlmacenSql } from './shared/almacen-sql.js';
import { InventarioLedger } from './shared/inventario-ledger.js';
import { StockController } from './stock/stock.controller.js';
import { StockHandler } from './stock/stock.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    AlmacenController,
    InventarioInicialController,
    IngresosController,
    SalidasController,
    TransferenciasController,
    PrestamoController,
    RecepcionController,
    StockController,
    KardexController,
    ConsultaController,
  ],
  providers: [
    AlmacenSql,
    InventarioLedger,
    AlmacenHandler,
    DocumentoHandler,
    PrestamoHandler,
    RecepcionHandler,
    StockHandler,
    KardexHandler,
    ConsultaHandler,
  ],
  exports: [AlmacenSql, InventarioLedger],
})
export class AlmacenModule {}
