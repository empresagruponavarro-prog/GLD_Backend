import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DocumentoResponseDto } from '../documentos/documento.dto.js';
import { RecepcionHandler } from './recepcion.handler.js';
import { CreateRecepcionDto, RecepcionOrdenCompraResponseDto, RecepcionPendienteResponseDto } from './recepcion.dto.js';

@ApiTags('almacen/recepciones')
@Controller('almacen/recepciones')
export class RecepcionController {
  constructor(private readonly handler: RecepcionHandler) {}

  @Get('pendientes')
  @ApiOperation({ summary: 'Órdenes de compra con productos pendientes de recibir en almacén' })
  @ApiQuery({ name: 'search', required: false, description: 'Número u código de la OC' })
  @ApiOkResponse({ type: RecepcionPendienteResponseDto, isArray: true })
  pendientes(@Query('search') search?: string): Promise<RecepcionPendienteResponseDto[]> {
    return this.handler.pendientes(search);
  }

  @Get('orden-compra/:id')
  @ApiOperation({ summary: 'Líneas recibibles (solo productos) de una OC con su saldo por recibir' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la OC (documento de origen)' })
  @ApiOkResponse({ type: RecepcionOrdenCompraResponseDto })
  @ApiNotFoundResponse({ description: 'La OC no existe' })
  getOrdenCompra(@Param('id', ParseIntPipe) id: number): Promise<RecepcionOrdenCompraResponseDto> {
    return this.handler.getOrdenCompra(id);
  }

  @Post()
  @ApiOperation({ summary: 'Recibir una OC en almacén: genera un ingreso COMPRA ligado a la OC' })
  @ApiCreatedResponse({ type: DocumentoResponseDto })
  @ApiBadRequestResponse({ description: 'Cantidad sobre el saldo, servicio, falta tipo de cambio o referencias inválidas' })
  recibir(@Body() dto: CreateRecepcionDto): Promise<DocumentoResponseDto> {
    return this.handler.recibir(dto);
  }
}
