import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { EstadoAvisosDto, PreferenciasAvisosDto } from './avisos.dto.js';
import { AvisosHandler } from './avisos.handler.js';

/**
 * Campana de avisos del Dashboard: lo leído y las preferencias son de cada persona, así que basta
 * con poder ver el módulo (`ver`) para marcarlos, aunque el verbo HTTP sea POST/PUT.
 */
@ApiTags('Operaciones · Avisos')
@Controller('operaciones/avisos')
@Modulo('operaciones')
export class AvisosController {
  constructor(private readonly handler: AvisosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Avisos sin leer, hasta cuándo se leyó y los tipos que importan a esta persona' })
  @ApiOkResponse({ type: EstadoAvisosDto })
  estado(@CurrentUser('id') usuario: string) {
    return this.handler.estado(usuario);
  }

  @Post('leidos')
  @HttpCode(200)
  @Accion('ver')
  @ApiOperation({ summary: 'Marcar como leído todo lo ocurrido hasta ahora' })
  @ApiOkResponse({ type: EstadoAvisosDto })
  leidos(@CurrentUser('id') usuario: string) {
    return this.handler.marcarLeidos(usuario);
  }

  @Put('preferencias')
  @Accion('ver')
  @ApiOperation({ summary: 'Elegir qué tipos de evento cuentan como avisos (nulo o vacío = todos)' })
  @ApiOkResponse({ type: EstadoAvisosDto })
  preferencias(@Body() dto: PreferenciasAvisosDto, @CurrentUser('id') usuario: string) {
    return this.handler.guardarPreferencias(usuario, dto);
  }
}
