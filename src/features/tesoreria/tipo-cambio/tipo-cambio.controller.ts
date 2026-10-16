import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { TipoCambioVigente } from '../shared/tipo-cambio.js';
import { ListTipoCambioQueryDto, TipoCambioResponseDto, UpsertTipoCambioDto } from '../tesoreria.dto.js';
import { TipoCambioHandler } from './tipo-cambio.handler.js';
import { LecturaCompartida, Modulo } from '../../../platform/auth/permisos.decorator.js';

@ApiTags('tesoreria / tipo de cambio')
@Controller('tesoreria/tipo-cambio')
@Modulo('tesoreria.tipo-cambio')
export class TipoCambioController {
  constructor(private readonly handler: TipoCambioHandler) {}

  @Get()
  @ApiOperation({ summary: 'Tipos de cambio diarios registrados' })
  @ApiOkResponse({ type: TipoCambioResponseDto, isArray: true })
  list(@Query() query: ListTipoCambioQueryDto): Promise<TipoCambioResponseDto[]> {
    return this.handler.list(query);
  }

  @LecturaCompartida()
  @Get('vigente')
  @ApiOperation({ summary: 'Tipo de cambio de una fecha o el ultimo anterior (exacto=false si no hay del dia)' })
  @ApiQuery({ name: 'moneda', example: 'USD' })
  @ApiQuery({ name: 'fecha', required: false, example: '2026-10-12' })
  @ApiOkResponse({ description: 'fecha, compra, venta, exacto' })
  @ApiNotFoundResponse({ description: 'Nunca se registro uno' })
  vigente(@Query('moneda') moneda: string, @Query('fecha') fecha?: string): Promise<TipoCambioVigente> {
    return this.handler.vigente(moneda ?? 'USD', fecha);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar o corregir el tipo de cambio de un dia' })
  @ApiOkResponse({ type: TipoCambioResponseDto })
  @ApiBadRequestResponse({ description: 'Valores invalidos' })
  upsert(@Body() dto: UpsertTipoCambioDto): Promise<TipoCambioResponseDto> {
    return this.handler.upsert(dto);
  }
}
