import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { HoyQueryDto } from '../shared/control-avance/hoy-query.dto.js';
import { ControlObraDto, CurvaSQueryDto, EventosQueryDto, ObraEventoDto } from './control.dto.js';
import { ControlHandler } from './control.handler.js';

/** Lecturas del control de avance: todo lo calculado por el motor y el historial de la obra. */
@ApiTags('Operaciones de Obra · Control')
@Controller('operaciones/obra/:idCentroCosto')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class ControlController {
  constructor(private readonly handler: ControlHandler) {}

  @Get('control')
  @ApiOperation({
    summary: 'Control de avance de la obra: ficha operativa y resultado del motor (programado, real, desviación, situación, plazos, árbol de partidas, Curva S, avisos)',
  })
  @ApiOkResponse({ type: ControlObraDto })
  obtener(@Param('idCentroCosto', ParseIntPipe) id: number, @Query() q: HoyQueryDto) {
    return this.handler.obtener(id, q.hoy);
  }

  @Get('control/curva-s')
  @ApiOperation({ summary: 'Curva S de la obra (pactado vs real por semana); tipo = todo · C (contractual) · A (adicionales)' })
  curvaS(@Param('idCentroCosto', ParseIntPipe) id: number, @Query() q: CurvaSQueryDto) {
    return this.handler.curvaS(id, q.tipo, q.hoy);
  }

  @Get('eventos')
  @ApiOperation({ summary: 'Historial de cambios de la obra (estado, avance, plazo, equipo, reprogramaciones)' })
  @ApiOkResponse({ type: [ObraEventoDto] })
  eventos(@Param('idCentroCosto', ParseIntPipe) id: number, @Query() q: EventosQueryDto) {
    return this.handler.eventos(id, q.limite);
  }
}
