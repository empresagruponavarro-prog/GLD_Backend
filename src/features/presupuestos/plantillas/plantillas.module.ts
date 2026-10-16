import { Module } from '@nestjs/common';
import { AplicarPlantillaController } from './aplicar-plantilla.controller.js';
import { PlantillasController } from './plantillas.controller.js';
import { PlantillasHandler } from './plantillas.handler.js';

@Module({
  controllers: [PlantillasController, AplicarPlantillaController],
  providers: [PlantillasHandler],
  exports: [PlantillasHandler],
})
export class PlantillasModule {}
