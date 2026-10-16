import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequerimientoResponseDto } from '../requerimiento/requerimiento.dto.js';
import { AprobarRequerimientoDto, ObservarRequerimientoDto, RechazarRequerimientoDto } from './flujo.dto.js';
import { FlujoHandler } from './flujo.handler.js';
import { Accion, Modulo } from '../../../platform/auth/permisos.decorator.js';

/**
 * Decisiones del aprobador sobre el FUR (módulo `requerimientos.aprobacion`). Separado de
 * `FlujoController` porque el permiso se declara una vez por controlador (plan 05 §7.1).
 */
@ApiTags('requerimientos / flujo')
@Controller('requerimientos/:id')
@Modulo('requerimientos.aprobacion')
@ApiParam({ name: 'id', type: Number, description: 'ID del requerimiento' })
export class FlujoAprobacionController {
  constructor(private readonly handler: FlujoHandler) {}

  @Accion('aprobar')
  @Post('observar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devolver con observaciones (ENVIADO o COTIZADO → OBSERVADO)' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transición no válida' })
  observar(@Param('id', ParseIntPipe) id: number, @Body() dto: ObservarRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.observar(id, dto);
  }

  @Accion('aprobar')
  @Post('aprobar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar y generar los documentos de origen (COTIZADO en compras, ENVIADO en los demas tipos)' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiBadRequestResponse({ description: 'Cantidades inválidas o aprobador no es Trabajador' })
  @ApiConflictResponse({ description: 'Transición no válida' })
  aprobar(@Param('id', ParseIntPipe) id: number, @Body() dto: AprobarRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.aprobar(id, dto);
  }

  @Accion('aprobar')
  @Post('rechazar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar (ENVIADO o COTIZADO → RECHAZADO, estado final)' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transición no válida' })
  rechazar(@Param('id', ParseIntPipe) id: number, @Body() dto: RechazarRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.rechazar(id, dto);
  }
}
