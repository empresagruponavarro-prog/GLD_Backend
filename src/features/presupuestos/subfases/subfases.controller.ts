import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LecturaCompartida, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { SubfasesCentroCostoDto, SubfasesQueryDto } from './subfases.dto.js';
import { SubfasesHandler } from './subfases.handler.js';

@ApiTags('Presupuestos')
@Controller('subfases')
@Modulo('presupuestos')
export class SubfasesController {
  constructor(private readonly handler: SubfasesHandler) {}

  /** Lo usan los formularios de requerimientos, documentos de origen y salidas de almacén, que no son del módulo de presupuestos. */
  @Get()
  @LecturaCompartida()
  @ApiOperation({ summary: 'Subfases de los presupuestos aprobados de una obra (para imputar compras y salidas)' })
  @ApiOkResponse({ type: SubfasesCentroCostoDto })
  listar(@Query() query: SubfasesQueryDto) {
    return this.handler.listar(query.id_centro_costo);
  }
}
