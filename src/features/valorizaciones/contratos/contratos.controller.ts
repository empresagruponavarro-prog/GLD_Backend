import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { ConsultaQueryDto, ConsultaValorizacionesHandler } from '../consulta/consulta.handler.js';
import { ContratosHandler } from './contratos.handler.js';
import { CreateContratoDto, ListContratosQueryDto, UpdateContratoDto } from './contratos.dto.js';

/** Contratos de valorización (módulo `valorizaciones`, el de Operaciones). El visto de Administración y la garantía están en `administracion.controller.ts`. */
@ApiTags('valorizaciones / contratos')
@Controller('valorizaciones')
@Modulo('valorizaciones')
export class ContratosController {
  constructor(
    private readonly handler: ContratosHandler,
    private readonly consulta: ConsultaValorizacionesHandler,
  ) {}

  @Get('contratos')
  @ApiOperation({ summary: 'Contratos de valorización (una orden de servicio = un contrato)' })
  @ApiOkResponse({ description: 'Pagina de contratos con lo valorizado, la garantía y lo pagado' })
  listar(@Query() query: ListContratosQueryDto) {
    return this.handler.listar(query);
  }

  @Get('contratos/:id')
  @ApiOperation({ summary: 'Detalle: condiciones, matriz de pagos, cuotas con su estado de pago, deductivos, garantía y cuenta corriente' })
  @ApiNotFoundResponse({ description: 'No existe' })
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.handler.obtener(id);
  }

  @Post('contratos')
  @ApiOperation({ summary: 'Crear el contrato de una orden de servicio registrada', description: 'Con el alta automática apagada es la forma de abrirlo. Las condiciones salen del tipo de servicio y de la cotización ganadora' })
  @ApiCreatedResponse({ description: 'Contrato en borrador' })
  @ApiBadRequestResponse({ description: 'La orden no es una OS registrada o no puede tener contrato' })
  @ApiConflictResponse({ description: 'La orden ya tiene contrato' })
  crear(@Body() dto: CreateContratoDto, @CurrentUser() user?: AuthUser) {
    return this.handler.crear(dto.id_documento_origen, user);
  }

  @Patch('contratos/:id')
  @ApiOperation({ summary: 'Editar el contrato', description: 'Cambiar adelanto, garantía, cantidad de valorizaciones o meses borra los vistos y devuelve el contrato a borrador' })
  @ApiConflictResponse({ description: 'Con valorizaciones aprobadas, pagos o liquidado no se cambia lo económico' })
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContratoDto, @CurrentUser() user?: AuthUser) {
    return this.handler.actualizar(id, dto, user);
  }

  @Accion('aprobar')
  @Post('contratos/:id/visto-operaciones')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Visto de Operaciones. Con el de Administración el contrato queda vigente y su adelanto se libera' })
  @ApiConflictResponse({ description: 'El contrato no está en borrador o el visto ya está dado' })
  vistoOperaciones(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: AuthUser) {
    return this.handler.visto(id, 'OPERACIONES', user);
  }

  @Get('garantias')
  @ApiOperation({ summary: 'Garantías retenidas por contrato, con su fecha de vencimiento y si ya vencieron' })
  garantias(@Query('solo_vencidas') soloVencidas?: string) {
    return this.consulta.garantias(soloVencidas === 'true');
  }

  /** Dinero de contratistas: no es lectura compartida. */
  @Get('consulta')
  @ApiOperation({ summary: 'Ejecución de pagos de valorizaciones por cliente, obra o contratista' })
  consultar(@Query() query: ConsultaQueryDto) {
    return this.consulta.consultar(query);
  }
}
