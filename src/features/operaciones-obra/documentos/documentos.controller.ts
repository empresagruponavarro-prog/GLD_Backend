import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { type ArchivoSubido, DocumentosHandler } from './documentos.handler.js';
import {
  ArchivoDocumentoDto,
  CreateObraDocumentoDto,
  DescartarArchivoDocumentoDto,
  EliminarDocumentoDto,
  ObraDocumentoDto,
  UpdateObraDocumentoDto,
} from './documentos.dto.js';
import { DOCUMENTO_EXTENSIONES, documentoMulterOptions, tipoMime } from './documentos.storage.js';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/documentos')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class DocumentosObraController {
  constructor(private readonly handler: DocumentosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar documentos y actas de la obra' })
  @ApiOkResponse({ type: [ObraDocumentoDto] })
  list(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.list(idCentroCosto);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un documento / acta (metadatos)' })
  @ApiCreatedResponse({ type: ObraDocumentoDto })
  create(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Body() dto: CreateObraDocumentoDto) {
    return this.handler.create(idCentroCosto, dto);
  }

  @Post('archivo')
  @ApiOperation({ summary: `Subir archivo (${DOCUMENTO_EXTENSIONES.join(' ')}, máx. 50 MB). Devuelve la clave para archivo_url` })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } }, required: ['archivo'] } })
  @ApiCreatedResponse({ type: ArchivoDocumentoDto })
  @UseInterceptors(FileInterceptor('archivo', documentoMulterOptions))
  subirArchivo(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @UploadedFile() file?: ArchivoSubido) {
    return this.handler.subirArchivo(idCentroCosto, file);
  }

  // Debe declararse antes de ':idDocumento' para que 'archivo' no se interprete como id.
  @Delete('archivo')
  @ApiOperation({ summary: 'Descartar un archivo subido que no se guardó en ningún documento (modal cancelado)' })
  @ApiQuery({ name: 'clave', required: true, description: 'archivo_url devuelto por POST /documentos/archivo' })
  @ApiOkResponse({ type: DescartarArchivoDocumentoDto })
  descartarArchivo(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Query('clave') clave: string) {
    return this.handler.descartarArchivo(idCentroCosto, clave);
  }

  @Get(':idDocumento/archivo')
  @ApiOperation({ summary: 'Descargar (o ver con ?inline=1) el archivo del documento' })
  @ApiParam({ name: 'idDocumento', type: Number })
  @ApiQuery({ name: 'inline', required: false, description: '1 = abrir en el navegador en lugar de descargar' })
  @ApiOkResponse({ description: 'Contenido binario del archivo', schema: { type: 'string', format: 'binary' } })
  @ApiResponse({ status: 302, description: 'Enlace externo: redirige a la URL' })
  async descargarArchivo(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idDocumento', ParseIntPipe) idDocumento: number,
    @Res() res: Response,
    @Query('inline') inline?: string,
  ) {
    const archivo = await this.handler.descargar(idCentroCosto, idDocumento);
    if (archivo.tipo === 'externo') {
      res.redirect(archivo.url);
      return;
    }
    const disposicion = inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', tipoMime(archivo.nombre));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${disposicion}; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`);
    res.sendFile(archivo.ruta);
  }

  @Patch(':idDocumento')
  @ApiOperation({ summary: 'Editar un documento / acta (null limpia campos opcionales; {} no cambia nada)' })
  @ApiParam({ name: 'idDocumento', type: Number })
  @ApiOkResponse({ type: ObraDocumentoDto })
  update(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idDocumento', ParseIntPipe) idDocumento: number,
    @Body() dto: UpdateObraDocumentoDto,
  ) {
    return this.handler.update(idCentroCosto, idDocumento, dto);
  }

  @Delete(':idDocumento')
  @ApiOperation({ summary: 'Eliminar un documento / acta (y su archivo local)' })
  @ApiParam({ name: 'idDocumento', type: Number })
  @ApiOkResponse({ type: EliminarDocumentoDto })
  remove(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idDocumento', ParseIntPipe) idDocumento: number,
  ) {
    return this.handler.remove(idCentroCosto, idDocumento);
  }
}
