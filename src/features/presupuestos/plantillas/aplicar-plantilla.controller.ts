import { Body, Controller, Param, Post } from '@nestjs/common';
import { AplicarPlantillaDto } from './plantillas.dto.js';
import { PlantillasHandler } from './plantillas.handler.js';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';

/**
 * Aplicar una plantilla modifica el PRESUPUESTO (módulo `presupuestos`), no la plantilla: va en
 * un controlador aparte porque el permiso se declara una vez por controlador (plan 05 §7.1).
 */
@Controller('presupuestos')
@Modulo('presupuestos')
export class AplicarPlantillaController {
  constructor(private readonly handler: PlantillasHandler) {}

  @Accion('editar')
  @Post(':id/aplicar-plantilla')
  async aplicarPlantilla(@Param('id') idPresupuesto: string, @Body() dto: AplicarPlantillaDto) {
    return await this.handler.aplicarPlantilla(idPresupuesto, dto);
  }
}
