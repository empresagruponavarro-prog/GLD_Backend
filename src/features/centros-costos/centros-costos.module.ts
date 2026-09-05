import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CentroCostoController } from './centro-costo/centro-costo.controller.js';
import { CentroCostoHandler } from './centro-costo/centro-costo.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [CentroCostoController],
  providers: [CentroCostoHandler],
})
export class CentrosCostosModule {}