import { Module } from '@nestjs/common';
import { PlantillasController } from './plantillas.controller.js';
import { PlantillasHandler } from './plantillas.handler.js';

@Module({
  controllers: [PlantillasController],
  providers: [PlantillasHandler],
  exports: [PlantillasHandler],
})
export class PlantillasModule {}
