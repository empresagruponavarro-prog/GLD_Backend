import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Accion, LecturaCompartida, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { PeriodoFiscalDto, SetPeriodoFiscalDto } from './periodo-fiscal.dto.js';
import { PeriodoFiscalHandler } from './periodo-fiscal.handler.js';

@ApiTags('proyectos / catálogos / periodos fiscales')
@Controller('proyectos/catalogos/periodos')
@Modulo('proyectos.catalogos')
export class PeriodoFiscalController {
  constructor(private readonly handler: PeriodoFiscalHandler) {}

  @LecturaCompartida() // lo usan los formularios de centro de costo y presupuesto
  @Get()
  @ApiOperation({ summary: 'Años fiscales' })
  @ApiQuery({ name: 'activos', required: false, type: Boolean })
  @ApiOkResponse({ type: PeriodoFiscalDto, isArray: true })
  list(@Query('activos') activos?: string) {
    return this.handler.list(activos === 'true');
  }

  @Put(':anio')
  @Accion('editar')
  @ApiOperation({ summary: 'Crea un año fiscal o lo activa/desactiva' })
  @ApiOkResponse({ type: PeriodoFiscalDto })
  set(@Param('anio', ParseIntPipe) anio: number, @Body() dto: SetPeriodoFiscalDto) {
    return this.handler.set(anio, dto.activo);
  }
}
