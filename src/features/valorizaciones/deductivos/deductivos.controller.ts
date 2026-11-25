import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { AnularDeductivoDto, CreateDeductivoDto } from './deductivos.dto.js';
import { DeductivosHandler } from './deductivos.handler.js';

/** Descuentos extraordinarios al contratista (material entregado, incidencias, penalidades…). */
@ApiTags('valorizaciones / deductivos')
@Controller('valorizaciones')
@Modulo('valorizaciones')
export class DeductivosController {
  constructor(private readonly handler: DeductivosHandler) {}

  @Get('contratos/:id/deductivos')
  @ApiOperation({ summary: 'Deductivos de la orden con lo aplicado y lo pendiente' })
  listar(@Param('id', ParseIntPipe) id: number) {
    return this.handler.listar(id);
  }

  @Get('contratos/:id/materiales')
  @ApiOperation({ summary: 'Líneas de PECOSA de la obra con lo que ya se cobró: lo que se puede descontar como MATERIAL' })
  materiales(@Param('id', ParseIntPipe) id: number) {
    return this.handler.materiales(id);
  }

  @Post('contratos/:id/deductivos')
  @ApiOperation({ summary: 'Registrar un deductivo (queda pendiente hasta que una valorización lo descuente)' })
  @ApiConflictResponse({ description: 'La cantidad supera lo entregado y aún no cobrado' })
  crear(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateDeductivoDto, @CurrentUser() user?: AuthUser) {
    return this.handler.crear(id, dto, user);
  }

  @Accion('anular')
  @Post('deductivos/:id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular un deductivo que todavía no se descontó' })
  @ApiConflictResponse({ description: 'Ya se descontó en una valorización' })
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularDeductivoDto) {
    return this.handler.anular(id, dto);
  }
}
