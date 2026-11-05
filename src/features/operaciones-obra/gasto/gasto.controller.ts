import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { GastoObraDto } from './gasto.dto.js';
import { GastoHandler } from './gasto.handler.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/gasto')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class GastoController {
  constructor(private readonly handler: GastoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Gasto de la obra por subfase frente al presupuesto Meta: directo, indirecto (PECOSA) y compromiso' })
  @ApiOkResponse({ type: GastoObraDto })
  obtener(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.obtener(idCentroCosto);
  }
}
