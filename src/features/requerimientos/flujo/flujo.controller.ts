import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequerimientoResponseDto } from '../requerimiento/requerimiento.dto.js';
import {
  AnularRequerimientoDto,
  CotizacionFlujoDto,
  EnviarRequerimientoDto,
} from './flujo.dto.js';
import { FlujoHandler } from './flujo.handler.js';
import { Accion, Modulo } from '../../../platform/auth/permisos.decorator.js';

/** Acciones del solicitante y de compras sobre el FUR (módulo `requerimientos`). Aprobar/observar/rechazar: `FlujoAprobacionController`. */
@ApiTags('requerimientos / flujo')
@Controller('requerimientos/:id')
@Modulo('requerimientos')
@ApiParam({ name: 'id', type: Number, description: 'ID del requerimiento' })
export class FlujoController {
  constructor(private readonly handler: FlujoHandler) {}

  @Accion('ver')
  @Post('enviar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar a aprobación (BORRADOR u OBSERVADO → ENVIADO)' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transición no válida' })
  enviar(@Param('id', ParseIntPipe) id: number, @Body() dto: EnviarRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.enviar(id, dto);
  }

  @Accion('ver')
  @Post('cerrar-cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar el cuadro comparativo (ENVIADO → COTIZADO); requiere al menos 1 cotizacion' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transicion no valida o sin cotizaciones' })
  cerrarCotizacion(@Param('id', ParseIntPipe) id: number, @Body() dto: CotizacionFlujoDto): Promise<RequerimientoResponseDto> {
    return this.handler.cerrarCotizacion(id, dto);
  }

  @Accion('ver')
  @Post('reabrir-cotizacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reabrir las cotizaciones (COTIZADO → ENVIADO)' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transicion no valida' })
  reabrirCotizacion(@Param('id', ParseIntPipe) id: number, @Body() dto: CotizacionFlujoDto): Promise<RequerimientoResponseDto> {
    return this.handler.reabrirCotizacion(id, dto);
  }

  @Accion('ver')
  @Post('anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular un FUR sin documentos de origen vigentes' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transición no válida o tiene documentos de origen vigentes' })
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.anular(id, dto);
  }
}
