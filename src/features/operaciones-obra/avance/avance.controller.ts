import { Body, Controller, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { HoyQueryDto } from '../shared/control-avance/hoy-query.dto.js';
import { AvanceObraDto, GuardarAvanceSemanaDto, ResultadoGuardarAvanceDto } from './avance.dto.js';
import { AvanceHandler } from './avance.handler.js';

@ApiTags('Operaciones de Obra · Avance')
@Controller('operaciones/obra/:idCentroCosto/avance')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class AvanceController {
  constructor(private readonly handler: AvanceHandler) {}

  @Get()
  @ApiOperation({ summary: 'Grilla de avance: subpartidas × semanas (metas efectivas y avance reportado de cada semana)' })
  @ApiQuery({ name: 'hoy', required: false, description: 'YYYY-MM-DD; por defecto la fecha de hoy en Lima (solo lectura)' })
  @ApiOkResponse({ type: AvanceObraDto })
  obtener(@Param('idCentroCosto', ParseIntPipe) id: number, @Query() q: HoyQueryDto) {
    return this.handler.obtener(id, q.hoy);
  }

  @Put('semanas/:semana')
  @ApiOperation({
    summary: 'Registrar el avance de una semana (lo avanzado SOLO esa semana, 0-100). Rechaza semanas futuras y sumas mayores a 100',
  })
  @ApiParam({ name: 'semana', type: Number, description: '1 a 16' })
  @ApiOkResponse({ type: ResultadoGuardarAvanceDto })
  guardarSemana(
    @Param('idCentroCosto', ParseIntPipe) id: number,
    @Param('semana', ParseIntPipe) semana: number,
    @Body() dto: GuardarAvanceSemanaDto,
    @CurrentUser('id') usuario: string,
  ) {
    return this.handler.guardarSemana(id, semana, dto, usuario);
  }
}
