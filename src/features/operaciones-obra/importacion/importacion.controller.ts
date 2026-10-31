import { BadRequestException, Controller, Param, ParseIntPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import multer from 'multer';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { ImportarExcelQueryDto, ResultadoImportacionExcelDto, VistaPreviaImportacionDto } from './importacion.dto.js';
import { ImportacionHandler, type ArchivoExcel } from './importacion.handler.js';

export const EXCEL_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** El libro se lee en memoria: no se guarda nada en disco. */
export const excelMulterOptions = {
  storage: multer.memoryStorage(),
  limits: { fileSize: EXCEL_MAX_BYTES, files: 1 },
  fileFilter: (_req: unknown, file: { originalname: string }, cb: (e: Error | null, ok: boolean) => void) => {
    if (/\.xlsx$/i.test(file.originalname)) cb(null, true);
    else cb(new BadRequestException('Solo se aceptan archivos .xlsx'), false);
  },
};

@ApiTags('Operaciones de Obra · Importación')
@Controller('operaciones/obra/:idCentroCosto/importar-excel')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class ImportacionController {
  constructor(private readonly handler: ImportacionHandler) {}

  @Post()
  @Accion('editar') // es un POST, pero reemplaza la ficha y la estructura de una obra existente
  @ApiOperation({
    summary:
      'Importar el Excel por proyecto (hojas Ficha, Partidas y Reprogramaciones). Con confirmar=false (por defecto) solo devuelve la vista previa con errores y avisos; con confirmar=true escribe todo en una transacción.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { archivo: { type: 'string', format: 'binary' } }, required: ['archivo'] } })
  @ApiOkResponse({ type: VistaPreviaImportacionDto, description: 'Vista previa (confirmar=false) o ResultadoImportacionExcelDto (confirmar=true)' })
  @UseInterceptors(FileInterceptor('archivo', excelMulterOptions))
  importar(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Query() q: ImportarExcelQueryDto,
    @UploadedFile() archivo: ArchivoExcel | undefined,
    @CurrentUser('id') usuario: string,
  ): Promise<VistaPreviaImportacionDto | ResultadoImportacionExcelDto> {
    return q.confirmar ? this.handler.importar(idCentroCosto, archivo, usuario) : this.handler.vistaPrevia(idCentroCosto, archivo);
  }
}
