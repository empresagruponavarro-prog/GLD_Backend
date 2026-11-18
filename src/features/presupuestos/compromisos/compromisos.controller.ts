import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CompromisosPresupuestoDto } from './compromisos.dto.js';
import { CompromisosHandler } from './compromisos.handler.js';

@ApiTags('presupuestos / compromisos')
@Controller('presupuestos/:id')
@Modulo('presupuestos')
@ApiParam({ name: 'id', type: Number, description: 'ID del presupuesto (`ppto_Principal.id`)' })
export class CompromisosPresupuestoController {
  constructor(private readonly handler: CompromisosHandler) {}

  @Get('compromisos')
  @ApiOperation({
    summary: 'FUR y órdenes que nacieron de la adjudicación de cotizaciones, y los ítems que todavía no tienen proveedor',
    description: 'Provisional = el presupuesto no está aprobado (se ve e imprime, no se programa ni se paga). Se cierra al aprobar.',
  })
  @ApiOkResponse({ type: CompromisosPresupuestoDto })
  @ApiNotFoundResponse({ description: 'El presupuesto no existe' })
  listar(@Param('id', ParseIntPipe) id: number): Promise<CompromisosPresupuestoDto> {
    return this.handler.listar(id);
  }
}
