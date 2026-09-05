import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CreateIncidenciaDto,
  IncidenciaResponseDto,
  ListIncidenciaQueryDto,
  UpdateIncidenciaDto,
} from './incidencia.dto.js';
import { IncidenciaHandler } from './incidencia.handler.js';

@ApiTags('incidencias')
@Controller('incidencias')
export class IncidenciaController {
  constructor(private readonly handler: IncidenciaHandler) {}

  @Post()
  @ApiOperation({ summary: 'Registrar una incidencia' })
  @ApiCreatedResponse({
    type: IncidenciaResponseDto,
    description: 'Incidencia registrada exitosamente',
  })
  create(@Body() dto: CreateIncidenciaDto): Promise<IncidenciaResponseDto> {
    return this.handler.create(dto);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicar una incidencia' })
  @ApiParam({ name: 'id', description: 'ID numérico de la incidencia a duplicar', type: Number })
  @ApiCreatedResponse({
    type: IncidenciaResponseDto,
    description: 'Incidencia duplicada exitosamente',
  })
  @ApiNotFoundResponse({ description: 'Incidencia original no encontrada' })
  duplicate(@Param('id', ParseIntPipe) id: number): Promise<IncidenciaResponseDto> {
    return this.handler.duplicate(id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar incidencias con filtros' })
  @ApiOkResponse({
    type: IncidenciaResponseDto,
    isArray: true,
    description: 'Lista de incidencias filtrada',
  })
  list(@Query() query: ListIncidenciaQueryDto): Promise<IncidenciaResponseDto[]> {
    return this.handler.list(query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Exportar incidencias a CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV descargable con BOM UTF-8' })
  async exportCsv(@Query() query: ListIncidenciaQueryDto, @Res() res: Response): Promise<void> {
    const csv = await this.handler.generateExcelCsv(query);
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=Registro_Incidencias.csv');
    res.send(bom + csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una incidencia por id' })
  @ApiParam({ name: 'id', description: 'ID numérico de la incidencia', type: Number })
  @ApiOkResponse({ type: IncidenciaResponseDto, description: 'Incidencia encontrada' })
  @ApiNotFoundResponse({ description: 'Incidencia no encontrada' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<IncidenciaResponseDto> {
    return this.handler.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una incidencia' })
  @ApiParam({ name: 'id', description: 'ID numérico de la incidencia', type: Number })
  @ApiOkResponse({
    type: IncidenciaResponseDto,
    description: 'Incidencia actualizada exitosamente',
  })
  @ApiNotFoundResponse({ description: 'Incidencia no encontrada' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIncidenciaDto,
  ): Promise<IncidenciaResponseDto> {
    return this.handler.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una incidencia' })
  @ApiParam({ name: 'id', description: 'ID numérico de la incidencia', type: Number })
  @ApiNoContentResponse({ description: 'Incidencia eliminada exitosamente' })
  @ApiNotFoundResponse({ description: 'Incidencia no encontrada' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.handler.remove(id);
  }
}