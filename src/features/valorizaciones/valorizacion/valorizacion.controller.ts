import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { ActualizarCuotaDto, AnularCuotaDto, CrearCuotaDto, SemanaQueryDto } from './valorizacion.dto.js';
import { ValorizacionHandler } from './valorizacion.handler.js';

/** Valorizaciones (cuotas) de un contrato. */
@ApiTags('valorizaciones / cuotas')
@Controller('valorizaciones')
@Modulo('valorizaciones')
export class ValorizacionController {
  constructor(private readonly handler: ValorizacionHandler) {}

  @Get('semana')
  @ApiOperation({ summary: 'Bandeja de la semana: contratos vigentes con su valorización por hacer y lo que sugiere el sistema' })
  semana(@Query() query: SemanaQueryDto) {
    return this.handler.semana(query.fecha);
  }

  @Get('cuotas/:id')
  @ApiOperation({ summary: 'Una valorización: el borrador se recalcula al leer; la aprobada es la congelada' })
  @ApiNotFoundResponse({ description: 'No existe' })
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.handler.obtener(id);
  }

  @Post('contratos/:idContrato/cuotas')
  @ApiOperation({ summary: 'Abrir la próxima valorización (borrador) con el avance al corte' })
  @ApiCreatedResponse({ description: 'Borrador calculado' })
  @ApiBadRequestResponse({ description: 'Corte futuro, línea ajena a la orden o avance inválido' })
  @ApiConflictResponse({ description: 'Contrato sin vistos, ya con borrador, o sin nada por valorizar' })
  crear(@Param('idContrato', ParseIntPipe) idContrato: number, @Body() dto: CrearCuotaDto, @CurrentUser() user?: AuthUser) {
    return this.handler.crear(idContrato, dto, user);
  }

  @Patch('cuotas/:id')
  @ApiOperation({ summary: 'Editar el borrador (corte, monto, avance manual, deductivos, factura); se recalcula' })
  @ApiConflictResponse({ description: 'Solo se edita un borrador' })
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarCuotaDto, @CurrentUser() user?: AuthUser) {
    return this.handler.actualizar(id, dto, user);
  }

  @Accion('aprobar')
  @Post('cuotas/:id/aprobar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar: recalcula en el servidor, congela los montos y numera VAL-; si agota lo pendiente liquida el contrato' })
  @ApiBadRequestResponse({ description: 'AVANCE_REQUERIDO o MOTIVO_REQUERIDO' })
  aprobar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: AuthUser) {
    return this.handler.aprobar(id, user);
  }

  @Accion('anular')
  @Post('cuotas/:id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular un borrador o la última valorización aprobada (sin pagos ni programaciones)' })
  @ApiConflictResponse({ description: 'No es la última, tiene pagos o la garantía ya se devolvió' })
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularCuotaDto, @CurrentUser() user?: AuthUser) {
    return this.handler.anular(id, dto, user);
  }
}
