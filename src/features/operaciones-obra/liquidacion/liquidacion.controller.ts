import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { DosierObraDto, LiquidacionObraDto } from './liquidacion.dto.js';
import { LiquidacionHandler } from './liquidacion.handler.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class LiquidacionController {
  constructor(private readonly handler: LiquidacionHandler) {}

  @Get('liquidacion')
  @ApiOperation({ summary: 'Requisitos de la liquidación de la obra y su estado' })
  @ApiOkResponse({ type: LiquidacionObraDto })
  obtener(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.obtener(idCentroCosto);
  }

  @Post('liquidacion')
  @Accion('aprobar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liquida la obra: el centro de costo pasa a CERRADO y sus presupuestos a LIQUIDADO' })
  @ApiOkResponse({ type: LiquidacionObraDto })
  liquidar(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @CurrentUser() user?: AuthUser) {
    return this.handler.liquidar(idCentroCosto, user?.usuario);
  }

  @Get('dosier')
  @ApiOperation({ summary: 'Qué entra en el dosier de la obra (PDF integrado); 409 si faltan planos obligatorios' })
  @ApiOkResponse({ type: DosierObraDto })
  dosier(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.dosier(idCentroCosto);
  }
}
