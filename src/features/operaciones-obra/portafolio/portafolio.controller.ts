import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { HoyQueryDto } from '../shared/control-avance/hoy-query.dto.js';
import {
  ArbolesQueryDto,
  ArbolObraDto,
  EventoPortafolioDto,
  EventosPortafolioQueryDto,
  PortafolioDto,
  PortafolioQueryDto,
  SincronizacionDto,
} from './portafolio.dto.js';
import { PortafolioHandler } from './portafolio.handler.js';

/**
 * Dashboard de Operaciones: vistas con todas las obras. Es un módulo de permisos propio
 * (`operaciones`), distinto de `obra` (que gobierna el detalle de una obra).
 */
@ApiTags('Operaciones · Portafolio')
@Controller('operaciones/portafolio')
@Modulo('operaciones')
export class PortafolioController {
  constructor(private readonly handler: PortafolioHandler) {}

  @Get()
  @ApiOperation({
    summary:
      'Portafolio de obras: una fila por obra con su ficha, equipo, estado, plazos, avance real vs programado, situación y mini Curva S. Admite los filtros globales del Dashboard.',
  })
  @ApiOkResponse({ type: PortafolioDto })
  listar(@Query() q: PortafolioQueryDto) {
    return this.handler.listar(q);
  }

  @Get('catalogos')
  @ApiOperation({ summary: 'Clientes, jefes, coordinadores, departamentos y años con obras (para llenar los filtros)' })
  catalogos(@Query() q: HoyQueryDto) {
    return this.handler.catalogos(q.hoy);
  }

  @Get('arboles')
  @ApiOperation({ summary: 'Árbol partida › subpartida con sus métricas y Curva S de varias obras (ids separados por coma, máx. 100)' })
  @ApiOkResponse({ type: [ArbolObraDto] })
  arboles(@Query() q: ArbolesQueryDto) {
    return this.handler.arboles(q.ids, q.hoy);
  }

  @Get('eventos')
  @ApiOperation({ summary: 'Avisos y cambios recientes de todas las obras (situación, plazo vencido, estado, avance…)' })
  @ApiOkResponse({ type: [EventoPortafolioDto] })
  eventos(@Query() q: EventosPortafolioQueryDto) {
    return this.handler.eventos(q);
  }

  @Post('eventos/sincronizar')
  @ApiOperation({ summary: 'Evalúa ahora los avisos que dependen del tiempo (pasa a Retrasada, plazo vencido); es idempotente' })
  @ApiOkResponse({ type: SincronizacionDto })
  sincronizar() {
    return this.handler.sincronizar(true);
  }
}
