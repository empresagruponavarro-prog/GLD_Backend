import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../../platform/db/pagination.js';
import { AnularPagoDto, EjecutarPagoDto, ListPagosQueryDto, PagoDirectoDto } from '../tesoreria.dto.js';
import { PagosHandler, type PagoDetalle } from './pagos.handler.js';
import { Accion, LecturaCompartida, Modulo } from '../../../platform/auth/permisos.decorator.js';

@ApiTags('tesoreria / pagos')
@Controller('tesoreria/pagos')
@Modulo('tesoreria.pagos')
export class PagosController {
  constructor(private readonly handler: PagosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Pagos ejecutados (comprobantes de pago)' })
  @ApiOkResponse({ description: 'Pagina de pagos' })
  list(@Query() query: ListPagosQueryDto): Promise<Paginated<PagoDetalle>> {
    return this.handler.list(query);
  }

  @LecturaCompartida()
  @Get(':id')
  @ApiOperation({ summary: 'Datos del comprobante de pago' })
  @ApiOkResponse({ description: 'Pago' })
  @ApiNotFoundResponse({ description: 'No existe' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<PagoDetalle> {
    return this.handler.getById(id);
  }

  @Accion('ver')
  @Post()
  @ApiOperation({
    summary: 'Ejecutar una programacion y emitir el comprobante CP-',
    description:
      'Si la cuenta esta en otra moneda usa el tipo de cambio de venta del dia (editable). Un pago menor a lo programado deja el resto programado.',
  })
  @ApiCreatedResponse({ description: 'Pago registrado' })
  @ApiBadRequestResponse({ description: 'Saldo, cuenta, tipo de cambio o numero de operacion invalidos' })
  @ApiConflictResponse({ description: 'La programacion o el documento ya no estan vigentes' })
  ejecutar(@Body() dto: EjecutarPagoDto): Promise<PagoDetalle> {
    return this.handler.ejecutar(dto);
  }

  @Accion('ver')
  @Post('directo')
  @ApiOperation({ summary: 'Pagar ahora (crea la programacion y el pago en una operacion)' })
  @ApiCreatedResponse({ description: 'Pago registrado' })
  @ApiBadRequestResponse({ description: 'Saldo, cuenta o tipo de cambio invalidos' })
  directo(@Body() dto: PagoDirectoDto): Promise<PagoDetalle> {
    return this.handler.pagarDirecto(dto);
  }

  @Accion('anular')
  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular un pago: el saldo se libera y la programacion vuelve a PROGRAMADO' })
  @ApiOkResponse({ description: 'Pago anulado' })
  @ApiConflictResponse({ description: 'Ya estaba anulado' })
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularPagoDto): Promise<PagoDetalle> {
    return this.handler.anular(id, dto);
  }
}
