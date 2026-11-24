import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { AdjudicadoHandler } from './adjudicado.handler.js';

@ApiTags('presupuestos / adjudicado')
@Controller('presupuestos/:id/adjudicado')
@Modulo('presupuestos')
@ApiParam({ name: 'id', type: Number, description: 'ID del presupuesto (`ppto_Principal.id`)' })
export class AdjudicadoController {
  constructor(private readonly handler: AdjudicadoHandler) {}

  @Get()
  @ApiOperation({
    summary: 'Presupuesto Adjudicado: el Meta frente a lo adjudicado por fase, subfase e ítem (soles, sin IGV), con la diferencia en monto y en %',
    description: 'Un ítem sin ganador vale lo del Meta. Reemplaza al antiguo «Comercial» como formato de cierre (plan 12, R-01).',
  })
  @ApiOkResponse({ description: 'Árbol con totales por nivel y conteo de ítems adjudicados / sin adjudicar / sin tipo de cambio' })
  @ApiNotFoundResponse({ description: 'El presupuesto no existe' })
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.handler.obtener(id);
  }
}
