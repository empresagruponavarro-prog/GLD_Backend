import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { CondicionesHandler } from '../condiciones/condiciones.handler.js';
import { CreateCondicionDto, UpdateCondicionDto } from '../condiciones/condiciones.dto.js';
import { ContratosHandler } from '../contratos/contratos.handler.js';
import { DevolverGarantiaDto } from '../contratos/contratos.dto.js';
import { RegistrarFacturaDto } from '../valorizacion/valorizacion.dto.js';
import { ValorizacionHandler } from '../valorizacion/valorizacion.handler.js';

/** Lo de Administración sobre valorizaciones (módulo `valorizaciones.administracion`): condiciones por tipo de servicio, segundo visto y devolución de garantía. */
@ApiTags('valorizaciones / administración')
@Controller('valorizaciones/administracion')
@Modulo('valorizaciones.administracion')
export class ValorizacionesAdministracionController {
  constructor(
    private readonly condiciones: CondicionesHandler,
    private readonly contratos: ContratosHandler,
    private readonly cuotas: ValorizacionHandler,
  ) {}

  @Get('condiciones')
  @ApiOperation({ summary: 'Condiciones por defecto de los contratistas según el tipo de servicio' })
  @ApiOkResponse({ description: 'Condiciones generales y por categoría' })
  listarCondiciones() {
    return this.condiciones.listar();
  }

  @Post('condiciones')
  @ApiOperation({ summary: 'Crear condiciones para un tipo de servicio (o las generales, sin categoría)' })
  crearCondicion(@Body() dto: CreateCondicionDto) {
    return this.condiciones.crear(dto);
  }

  @Patch('condiciones/:id')
  @ApiOperation({ summary: 'Editar condiciones; solo afectan a los contratos que se creen después' })
  actualizarCondicion(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCondicionDto) {
    return this.condiciones.actualizar(id, dto);
  }

  @Accion('aprobar')
  @Post('contratos/:id/visto')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Visto de Administración. Con el de Operaciones el contrato queda vigente y su adelanto se libera' })
  @ApiConflictResponse({ description: 'El contrato no está en borrador o el visto ya está dado' })
  visto(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: AuthUser) {
    return this.contratos.visto(id, 'ADMINISTRACION', user);
  }

  @Accion('editar')
  @Patch('cuotas/:id/factura')
  @ApiOperation({ summary: 'Anotar la factura que el contratista presenta por una cuota aprobada', description: 'Alimenta el control de facturas del contrato: lo valorizado debe estar facturado' })
  @ApiConflictResponse({ description: 'La cuota no está aprobada o es la devolución de la garantía' })
  registrarFactura(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarFacturaDto) {
    return this.cuotas.registrarFactura(id, dto);
  }

  @Accion('aprobar')
  @Post('contratos/:id/devolver-garantia')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devolver la garantía retenida de un contrato liquidado', description: 'Antes del plazo hace falta el motivo. Los deductivos pendientes se descuentan de la devolución' })
  @ApiConflictResponse({ description: 'El contrato no está liquidado, no hay garantía o falta el motivo' })
  devolverGarantia(@Param('id', ParseIntPipe) id: number, @Body() dto: DevolverGarantiaDto, @CurrentUser() user?: AuthUser) {
    return this.contratos.devolverGarantia(id, dto, user);
  }
}
