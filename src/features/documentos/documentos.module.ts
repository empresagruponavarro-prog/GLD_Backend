import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AlmacenModule } from '../almacen/almacen.module.js';
import { RequerimientosModule } from '../requerimientos/requerimientos.module.js';
import { AdministracionController } from './administracion/administracion.controller.js';
import { AdministracionHandler } from './administracion/administracion.handler.js';
import { DocumentosOrigenController } from './documentos-origen/documentos-origen.controller.js';
import { DocumentosOrigenHandler } from './documentos-origen/documentos-origen.handler.js';

@Module({
  imports: [PrismaModule, AlmacenModule, RequerimientosModule],
  controllers: [DocumentosOrigenController, AdministracionController],
  providers: [DocumentosOrigenHandler, AdministracionHandler],
})
export class DocumentosModule {}
