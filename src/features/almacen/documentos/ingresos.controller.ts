import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { DocumentoHandler } from './documento.handler.js';
import { CreateDocumentoDto, DocumentoResponseDto, ListDocumentoQueryDto } from './documento.dto.js';

@ApiTags('almacen/ingresos')
@Controller('almacen/ingresos')
export class IngresosController {
  constructor(private readonly handler: DocumentoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar ingresos (paginado, con filtros)' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListDocumentoQueryDto): Promise<Paginated<DocumentoResponseDto>> {
    return this.handler.list('INGRESO', query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un ingreso con sus líneas' })
  @ApiOkResponse({ type: DocumentoResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<DocumentoResponseDto> {
    return this.handler.getById(id, 'INGRESO');
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un ingreso' })
  @ApiCreatedResponse({ type: DocumentoResponseDto })
  @ApiBadRequestResponse({ description: 'Datos o referencias inválidas' })
  @ApiConflictResponse({ description: 'Stock insuficiente / regla de negocio' })
  create(@Body() dto: CreateDocumentoDto): Promise<DocumentoResponseDto> {
    return this.handler.registrar('INGRESO', dto);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular un ingreso (genera el documento inverso)' })
  @ApiOkResponse({ type: DocumentoResponseDto })
  @ApiConflictResponse({ description: 'Ya anulado o el stock no permite revertir' })
  anular(@Param('id', ParseIntPipe) id: number): Promise<DocumentoResponseDto> {
    return this.handler.anular(id, 'INGRESO');
  }
}
