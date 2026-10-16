import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Paginated } from '../../../platform/db/pagination.js';
import {
  AnularDocumentoDto,
  CreateDocumentoDirectoDto,
  ListDocumentosAdminQueryDto,
  UpdateDeduccionesDto,
} from './administracion.dto.js';
import { AdministracionHandler, type DocumentoDetalle } from './administracion.handler.js';
import { Accion, LecturaCompartida, Modulo } from '../../../platform/auth/permisos.decorator.js';

@ApiTags('documentos / administracion')
@Controller('administracion/documentos-origen')
@Modulo('documentos.administracion')
export class AdministracionController {
  constructor(private readonly handler: AdministracionHandler) {}

  @Get()
  @ApiOperation({
    summary: 'Documentos de origen con neto a pagar, vencimiento y estado de pago calculados',
    description:
      'Filtros por clase, estado, estado de pago, importes, fechas de emision y vencimiento, centro de costos, grupo de centros de costos, area, proveedor y FUR.',
  })
  @ApiOkResponse({ description: 'Pagina de documentos' })
  list(@Query() query: ListDocumentosAdminQueryDto): Promise<Paginated<unknown>> {
    return this.handler.list(query);
  }

  @LecturaCompartida()
  @Get(':id')
  @ApiOperation({ summary: 'Detalle: lineas, programaciones, pagos y motivo de la retencion' })
  @ApiOkResponse({ description: 'Documento' })
  @ApiNotFoundResponse({ description: 'No existe' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<DocumentoDetalle> {
    return this.handler.getById(id);
  }

  @LecturaCompartida()
  @Get(':id/expediente')
  @ApiOperation({ summary: 'Expediente: FUR, cuadro comparativo, documento, recepciones, programaciones y pagos' })
  @ApiOkResponse({ description: 'Expediente' })
  @ApiNotFoundResponse({ description: 'No existe' })
  expediente(@Param('id', ParseIntPipe) id: number) {
    return this.handler.expediente(id);
  }

  @Post('directo')
  @ApiOperation({ summary: 'Registrar directamente un gasto financiero, pago de servicio u otro documento (sin lineas)' })
  @ApiCreatedResponse({ description: 'Documento creado' })
  @ApiBadRequestResponse({ description: 'Referencias invalidas o falta tipo de cambio' })
  crearDirecto(@Body() dto: CreateDocumentoDirectoDto): Promise<DocumentoDetalle> {
    return this.handler.crearDirecto(dto);
  }

  @Patch(':id/deducciones')
  @ApiOperation({
    summary: 'Cambiar renta 4ta, descuentos, detraccion, retencion, IGV, vencimiento o area',
    description: 'Con pagos registrados no se pueden cambiar montos; el vencimiento y el area si.',
  })
  @ApiOkResponse({ description: 'Documento actualizado' })
  @ApiConflictResponse({ description: 'Tiene pagos o el nuevo monto es menor a lo programado' })
  deducciones(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeduccionesDto): Promise<DocumentoDetalle> {
    return this.handler.actualizarDeducciones(id, dto);
  }

  @Accion('ver')
  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular el documento (sin pagos, programaciones ni recepciones vigentes)' })
  @ApiOkResponse({ description: 'Documento anulado' })
  @ApiConflictResponse({ description: 'Tiene dependientes vigentes' })
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularDocumentoDto): Promise<DocumentoDetalle> {
    return this.handler.anular(id, dto);
  }
}
