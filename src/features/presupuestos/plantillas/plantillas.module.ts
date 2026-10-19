import { Module } from '@nestjs/common';
import { AplicarPlantillaController } from './aplicar-plantilla.controller.js';
import { PlantillasController } from './plantillas.controller.js';
import { PlantillasHandler } from './plantillas.handler.js';
import { PlantillasItemsController } from '../plantillas-items/plantillas-items.controller.js';
import { PlantillasItemsHandler } from '../plantillas-items/plantillas-items.handler.js';

@Module({
  controllers: [PlantillasController, AplicarPlantillaController, PlantillasItemsController],
  providers: [PlantillasHandler, PlantillasItemsHandler],
  exports: [PlantillasHandler],
})
export class PlantillasModule {}
