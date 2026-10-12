import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DocumentosHandler } from './documentos.handler.js';
import { CreateObraDocumentoDto, UpdateObraDocumentoDto } from './documentos.dto.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/documentos')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class DocumentosObraController {
  constructor(private readonly handler: DocumentosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar documentos y actas de la obra' })
  list(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.list(idCentroCosto);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un documento / acta (metadatos)' })
  create(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Body() dto: CreateObraDocumentoDto) {
    return this.handler.create(idCentroCosto, dto);
  }

  @Patch(':idDocumento')
  @ApiOperation({ summary: 'Editar un documento / acta' })
  @ApiParam({ name: 'idDocumento', type: Number })
  update(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idDocumento', ParseIntPipe) idDocumento: number,
    @Body() dto: UpdateObraDocumentoDto,
  ) {
    return this.handler.update(idCentroCosto, idDocumento, dto);
  }

  @Delete(':idDocumento')
  @ApiOperation({ summary: 'Eliminar un documento / acta' })
  @ApiParam({ name: 'idDocumento', type: Number })
  remove(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idDocumento', ParseIntPipe) idDocumento: number,
  ) {
    return this.handler.remove(idCentroCosto, idDocumento);
  }
}
