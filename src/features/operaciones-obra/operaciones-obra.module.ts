import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ObraController } from './obra/obra.controller.js';
import { ObraHandler } from './obra/obra.handler.js';

@Module({
  imports: [PrismaModule],
  controllers: [ObraController],
  providers: [ObraHandler],
})
export class OperacionesObraModule {}
