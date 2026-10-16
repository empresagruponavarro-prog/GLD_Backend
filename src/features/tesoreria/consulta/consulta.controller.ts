import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsultaResumenQueryDto, ConsultaRetencionesQueryDto } from '../tesoreria.dto.js';
import { ConsultaHandler } from './consulta.handler.js';
import { Modulo } from '../../../platform/auth/permisos.decorator.js';

@ApiTags('tesoreria / consulta')
@Controller('tesoreria/consulta')
@Modulo('tesoreria.consulta')
export class ConsultaController {
  constructor(private readonly handler: ConsultaHandler) {}

  @Get('resumen')
  @ApiOperation({
    summary: 'Tablero gerencial en soles',
    description:
      'Comprometido, programado, pagado y saldo; comprometido vs. pagado por mes; deuda por centro de costos, grupo y area; vencimientos; pagado por proveedor; programado por cuenta.',
  })
  @ApiOkResponse({ description: 'Indicadores del tablero' })
  resumen(@Query() query: ConsultaResumenQueryDto) {
    return this.handler.resumen(query);
  }

  @Get('retenciones')
  @ApiOperation({ summary: 'Reporte mensual de retenciones del IGV y detracciones pagadas' })
  @ApiOkResponse({ description: 'Retenciones y detracciones del periodo' })
  retenciones(@Query() query: ConsultaRetencionesQueryDto) {
    return this.handler.retenciones(query.periodo);
  }
}
