import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { DocumentoHandler } from './documento.handler.js';
import { CreateDocumentoDto, DocumentoResponseDto, ListDocumentoQueryDto } from './documento.dto.js';

@ApiTags('almacen/inventario-inicial')
@Controller('almacen/inventario-inicial')
export class InventarioInicialController {
  constructor(private readonly handler: DocumentoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar documentos de inventario inicial' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListDocumentoQueryDto): Promise<Paginated<DocumentoResponseDto>> {
    return this.handler.list('INGRESO', { ...query, motivo: 'INVENTARIO_INICIAL' });
  }

  @Post()
  @ApiOperation({ summary: 'Registrar inventario inicial (conteo físico validado, una sola vez por producto y almacén)' })
  @ApiCreatedResponse({ type: DocumentoResponseDto })
  @ApiBadRequestResponse({ description: 'Datos o referencias inválidas' })
  @ApiConflictResponse({ description: 'El producto ya tiene movimientos en ese almacén' })
  create(@Body() dto: CreateDocumentoDto): Promise<DocumentoResponseDto> {
    if (dto.motivo !== 'INVENTARIO_INICIAL') {
      throw new BadRequestException('El motivo debe ser INVENTARIO_INICIAL');
    }
    return this.handler.registrar('INGRESO', dto);
  }
}
