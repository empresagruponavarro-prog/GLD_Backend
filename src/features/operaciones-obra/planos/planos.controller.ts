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
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { type ArchivoSubido, PlanosHandler } from './planos.handler.js';
import { CreateObraPlanoDto, NuevaVersionPlanoDto, UpdateObraPlanoDto } from './planos.dto.js';
import { PLANO_EXTENSIONES, planoMulterOptions } from './planos.storage.js';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/planos')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class PlanosController {
  constructor(private readonly handler: PlanosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar planos vigentes de la obra' })
  list(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.list(idCentroCosto);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo plano (metadatos)' })
  create(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Body() dto: CreateObraPlanoDto) {
    return this.handler.create(idCentroCosto, dto);
  }

  @Post('archivo')
  @ApiOperation({ summary: `Subir archivo de plano (${PLANO_EXTENSIONES.join(' ')}, máx. 50 MB). Devuelve la clave para archivo_url` })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } }, required: ['archivo'] } })
  @UseInterceptors(FileInterceptor('archivo', planoMulterOptions))
  subirArchivo(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @UploadedFile() file?: ArchivoSubido) {
    return this.handler.subirArchivo(idCentroCosto, file);
  }

  @Delete('archivo')
  @ApiOperation({ summary: 'Descartar un archivo subido que no se guardó en ningún plano (modal cancelado)' })
  @ApiQuery({ name: 'clave', required: true, description: 'archivo_url devuelto por POST /planos/archivo' })
  descartarArchivo(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number, @Query('clave') clave: string) {
    return this.handler.descartarArchivo(idCentroCosto, clave);
  }

  @Get(':idPlano/archivo')
  @ApiOperation({ summary: 'Descargar (o ver con ?inline=1) el archivo del plano' })
  @ApiParam({ name: 'idPlano', type: Number })
  @ApiQuery({ name: 'inline', required: false, description: '1 = abrir en el navegador en lugar de descargar' })
  async descargarArchivo(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
    @Res() res: Response,
    @Query('inline') inline?: string,
  ) {
    const archivo = await this.handler.descargar(idCentroCosto, idPlano);
    if (archivo.tipo === 'externo') {
      res.redirect(archivo.url);
      return;
    }
    const disposicion = inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposicion}; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`);
    res.sendFile(archivo.ruta);
  }

  @Patch(':idPlano')
  @ApiOperation({ summary: 'Editar metadatos de un plano' })
  @ApiParam({ name: 'idPlano', type: Number })
  update(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
    @Body() dto: UpdateObraPlanoDto,
  ) {
    return this.handler.update(idCentroCosto, idPlano, dto);
  }

  @Accion('editar')
  @Post(':idPlano/versiones')
  @ApiOperation({ summary: 'Emitir una nueva versión/revisión del plano (la anterior queda histórica)' })
  @ApiParam({ name: 'idPlano', type: Number })
  nuevaVersion(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
    @Body() dto: NuevaVersionPlanoDto,
  ) {
    return this.handler.nuevaVersion(idCentroCosto, idPlano, dto);
  }

  @Get(':idPlano/historial')
  @ApiOperation({ summary: 'Historial de revisiones del plano' })
  @ApiParam({ name: 'idPlano', type: Number })
  historial(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
  ) {
    return this.handler.historial(idCentroCosto, idPlano);
  }

  @Delete(':idPlano')
  @ApiOperation({ summary: 'Eliminar una versión de plano (restaura la anterior si era la vigente)' })
  @ApiParam({ name: 'idPlano', type: Number })
  remove(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idPlano', ParseIntPipe) idPlano: number,
  ) {
    return this.handler.remove(idCentroCosto, idPlano);
  }
}
