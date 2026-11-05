import { Controller, Delete, Get, GoneException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiGoneResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CronogramaHandler } from './cronograma.handler.js';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';

/** Mensaje de las rutas retiradas: dónde se registra ahora lo que antes se escribía aquí. */
export const MSG_CRONOGRAMA_SOLO_LECTURA =
  'El cronograma semanal es solo de consulta: el avance de la obra sale de sus partidas y subpartidas. Registre el avance y las fechas en «Control de avance»';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/cronograma')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class CronogramaController {
  constructor(private readonly handler: CronogramaHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar las semanas del cronograma de la obra (histórico, solo lectura)' })
  list(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.list(idCentroCosto);
  }

  @Post('lote')
  @ApiOperation({ summary: '(Retirado) Generador masivo de semanas', deprecated: true })
  @ApiGoneResponse({ description: MSG_CRONOGRAMA_SOLO_LECTURA })
  createLote(): never {
    throw new GoneException(MSG_CRONOGRAMA_SOLO_LECTURA);
  }

  @Post()
  @ApiOperation({ summary: '(Retirado) Programar una semana', deprecated: true })
  @ApiGoneResponse({ description: MSG_CRONOGRAMA_SOLO_LECTURA })
  create(): never {
    throw new GoneException(MSG_CRONOGRAMA_SOLO_LECTURA);
  }

  @Patch(':idSemana')
  @ApiOperation({ summary: '(Retirado) Editar una semana', deprecated: true })
  @ApiGoneResponse({ description: MSG_CRONOGRAMA_SOLO_LECTURA })
  update(): never {
    throw new GoneException(MSG_CRONOGRAMA_SOLO_LECTURA);
  }

  @Patch(':idSemana/avance')
  @ApiOperation({ summary: '(Retirado) Registrar el avance de una semana', deprecated: true })
  @ApiGoneResponse({ description: MSG_CRONOGRAMA_SOLO_LECTURA })
  updateAvance(): never {
    throw new GoneException(MSG_CRONOGRAMA_SOLO_LECTURA);
  }

  @Delete(':idSemana')
  @ApiOperation({ summary: '(Retirado) Eliminar una semana', deprecated: true })
  @ApiGoneResponse({ description: MSG_CRONOGRAMA_SOLO_LECTURA })
  remove(): never {
    throw new GoneException(MSG_CRONOGRAMA_SOLO_LECTURA);
  }
}
