import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { DocumentoHandler } from './documento.handler.js';
import { CreateDocumentoDto, DocumentoResponseDto, ListDocumentoQueryDto } from './documento.dto.js';
import { Accion, Modulo } from '../../../platform/auth/permisos.decorator.js';

@ApiTags('almacen/inventario-inicial')
@Controller('almacen/inventario-inicial')
@Modulo('almacen.inventario-inicial')
export class InventarioInicialController {
  constructor(private readonly handler: DocumentoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar documentos de inventario inicial' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListDocumentoQueryDto): Promise<Paginated<DocumentoResponseDto>> {
    return this.handler.list('INGRESO', { ...query, motivo: 'INVENTARIO_INICIAL' });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un documento de inventario inicial con sus líneas' })
  @ApiOkResponse({ type: DocumentoResponseDto })
  @ApiNotFoundResponse({ description: 'No existe o no es un inventario inicial' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<DocumentoResponseDto> {
    return this.handler.getById(id, 'INGRESO', 'INVENTARIO_INICIAL');
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

  @Accion('anular')
  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Anular un inventario inicial (genera la salida inversa; después no se puede volver a registrar el inicial de esos productos)',
  })
  @ApiOkResponse({ type: DocumentoResponseDto })
  @ApiNotFoundResponse({ description: 'No existe o no es un inventario inicial' })
  @ApiConflictResponse({ description: 'Ya anulado o el stock no permite revertir' })
  anular(@Param('id', ParseIntPipe) id: number): Promise<DocumentoResponseDto> {
    return this.handler.anular(id, 'INGRESO', 'INVENTARIO_INICIAL');
  }
}
