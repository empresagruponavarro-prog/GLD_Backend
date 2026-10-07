import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { DocumentoHandler } from './documento.handler.js';
import { CreateDocumentoDto, DocumentoResponseDto, ListDocumentoQueryDto } from './documento.dto.js';

@ApiTags('almacen/salidas')
@Controller('almacen/salidas')
export class SalidasController {
  constructor(private readonly handler: DocumentoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar salidas (paginado, con filtros)' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListDocumentoQueryDto): Promise<Paginated<DocumentoResponseDto>> {
    return this.handler.list('SALIDA', query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una salida con sus líneas' })
  @ApiOkResponse({ type: DocumentoResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<DocumentoResponseDto> {
    return this.handler.getById(id, 'SALIDA');
  }

  @Post()
  @ApiOperation({ summary: 'Registrar una salida' })
  @ApiCreatedResponse({ type: DocumentoResponseDto })
  @ApiBadRequestResponse({ description: 'Datos o referencias inválidas' })
  @ApiConflictResponse({ description: 'Stock insuficiente / regla de negocio' })
  create(@Body() dto: CreateDocumentoDto): Promise<DocumentoResponseDto> {
    return this.handler.registrar('SALIDA', dto);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular una salida (genera el documento inverso)' })
  @ApiOkResponse({ type: DocumentoResponseDto })
  @ApiConflictResponse({ description: 'Ya anulado o el stock no permite revertir' })
  anular(@Param('id', ParseIntPipe) id: number): Promise<DocumentoResponseDto> {
    return this.handler.anular(id, 'SALIDA');
  }
}
