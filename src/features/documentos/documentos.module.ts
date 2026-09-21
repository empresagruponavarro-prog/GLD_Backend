import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { DocumentosOrigenController } from './documentos-origen/documentos-origen.controller.js';
import { DocumentosOrigenHandler } from './documentos-origen/documentos-origen.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentosOrigenController],
  providers: [DocumentosOrigenHandler],
})
export class DocumentosModule {}
