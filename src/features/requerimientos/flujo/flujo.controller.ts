import { Body, Controller, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequerimientoResponseDto } from '../requerimiento/requerimiento.dto.js';
import {
  AnularRequerimientoDto,
  AprobarRequerimientoDto,
  EnviarRequerimientoDto,
  ObservarRequerimientoDto,
  RechazarRequerimientoDto,
} from './flujo.dto.js';
import { FlujoHandler } from './flujo.handler.js';

@ApiTags('requerimientos / flujo')
@Controller('requerimientos/:id')
@ApiParam({ name: 'id', type: Number, description: 'ID del requerimiento' })
export class FlujoController {
  constructor(private readonly handler: FlujoHandler) {}

  @Post('enviar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar a aprobación (BORRADOR u OBSERVADO → ENVIADO)' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transición no válida' })
  enviar(@Param('id', ParseIntPipe) id: number, @Body() dto: EnviarRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.enviar(id, dto);
  }

  @Post('observar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devolver con observaciones (ENVIADO → OBSERVADO)' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transición no válida' })
  observar(@Param('id', ParseIntPipe) id: number, @Body() dto: ObservarRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.observar(id, dto);
  }

  @Post('aprobar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar (ENVIADO → APROBADO), con cantidades aprobadas opcionales por línea' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiBadRequestResponse({ description: 'Cantidades inválidas o aprobador no es Trabajador' })
  @ApiConflictResponse({ description: 'Transición no válida' })
  aprobar(@Param('id', ParseIntPipe) id: number, @Body() dto: AprobarRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.aprobar(id, dto);
  }

  @Post('rechazar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar (ENVIADO → RECHAZADO, estado final)' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transición no válida' })
  rechazar(@Param('id', ParseIntPipe) id: number, @Body() dto: RechazarRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.rechazar(id, dto);
  }

  @Post('anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular un FUR sin órdenes de compra vinculadas' })
  @ApiOkResponse({ type: RequerimientoResponseDto })
  @ApiConflictResponse({ description: 'Transición no válida o tiene OC vinculadas' })
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularRequerimientoDto): Promise<RequerimientoResponseDto> {
    return this.handler.anular(id, dto);
  }
}
