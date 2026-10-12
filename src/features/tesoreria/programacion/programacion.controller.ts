import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../../platform/db/pagination.js';
import {
  CreateProgramacionDto,
  ListProgramacionQueryDto,
  PendientesProgramacionQueryDto,
  UpdateProgramacionDto,
} from '../tesoreria.dto.js';
import { ProgramacionHandler, type ProgramacionRow } from './programacion.handler.js';

@ApiTags('tesoreria / programacion de pagos')
@Controller('tesoreria/programacion')
export class ProgramacionController {
  constructor(private readonly handler: ProgramacionHandler) {}

  @Get('pendientes')
  @ApiOperation({ summary: 'Documentos de origen con saldo por programar (proveedor o detraccion)' })
  @ApiOkResponse({ description: 'Pagina de documentos' })
  pendientes(@Query() query: PendientesProgramacionQueryDto): Promise<Paginated<unknown>> {
    return this.handler.pendientes(query);
  }

  @Get()
  @ApiOperation({ summary: 'Agenda de pagos programados con totales en soles por fecha' })
  @ApiOkResponse({ description: 'items y totales_por_fecha' })
  agenda(@Query() query: ListProgramacionQueryDto) {
    return this.handler.agenda(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Programar pagos en lote (todo o nada)',
    description: 'La fecha debe ser viernes, salvo pagos urgentes con motivo. El monto no puede superar el saldo por programar.',
  })
  @ApiCreatedResponse({ description: 'Programaciones creadas' })
  @ApiBadRequestResponse({ description: 'Fecha no viernes, monto sobre el saldo o cuenta invalida' })
  @ApiConflictResponse({ description: 'Documento anulado' })
  crear(@Body() dto: CreateProgramacionDto): Promise<ProgramacionRow[]> {
    return this.handler.crear(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Reprogramar (solo PROGRAMADO), con las mismas reglas' })
  @ApiOkResponse({ description: 'Programacion actualizada' })
  @ApiNotFoundResponse({ description: 'No existe' })
  @ApiConflictResponse({ description: 'No esta PROGRAMADO' })
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProgramacionDto): Promise<ProgramacionRow> {
    return this.handler.actualizar(id, dto);
  }

  @Post(':id/cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar una programacion (libera el saldo)' })
  @ApiOkResponse({ description: 'Programacion cancelada' })
  @ApiConflictResponse({ description: 'No esta PROGRAMADO' })
  cancelar(@Param('id', ParseIntPipe) id: number): Promise<ProgramacionRow> {
    return this.handler.cancelar(id);
  }
}
