import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { DocumentosOrigenHandler } from './documentos-origen.handler.js';
import {
  CreateDocumentoOrigenDto,
  DetallePorFaseQueryDto,
  DocumentoOrigenDetalleLineaResponseDto,
  DocumentoOrigenResponseDto,
  ListDocumentosOrigenQueryDto,
  UpdateDocumentoOrigenDto,
} from './documentos-origen.dto.js';

@ApiTags('documentos / origen')
@Controller('documentos/origen')
export class DocumentosOrigenController {
  constructor(private readonly handler: DocumentosOrigenHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar documentos de origen (órdenes de compra) con paginación' })
  @ApiOkResponse({ description: 'Lista paginada de documentos de origen' })
  list(@Query() query: ListDocumentosOrigenQueryDto): Promise<Paginated<DocumentoOrigenResponseDto>> {
    return this.handler.list(query);
  }

  @Get('detalle-por-fase')
  @ApiOperation({ summary: 'Listar el detalle (productos) de documentos de origen por centro de costo y fase' })
  @ApiOkResponse({ type: DocumentoOrigenDetalleLineaResponseDto, isArray: true })
  listDetallePorFase(
    @Query() query: DetallePorFaseQueryDto,
  ): Promise<DocumentoOrigenDetalleLineaResponseDto[]> {
    return this.handler.listDetallePorFase(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un documento de origen por id (datos completos del formulario)' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del documento de origen' })
  @ApiOkResponse({ type: DocumentoOrigenResponseDto })
  @ApiNotFoundResponse({ description: 'Documento de origen no encontrado' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<DocumentoOrigenResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un documento de origen' })
  @ApiCreatedResponse({ type: DocumentoOrigenResponseDto })
  create(@Body() dto: CreateDocumentoOrigenDto): Promise<DocumentoOrigenResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un documento de origen' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del documento de origen' })
  @ApiOkResponse({ type: DocumentoOrigenResponseDto })
  @ApiNotFoundResponse({ description: 'Documento de origen no encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentoOrigenDto,
  ): Promise<DocumentoOrigenResponseDto> {
    return this.handler.update(id, dto);
  }
}
