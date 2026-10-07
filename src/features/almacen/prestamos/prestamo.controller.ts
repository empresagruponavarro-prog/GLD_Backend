import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type Paginated } from '../../../platform/db/pagination.js';
import { PrestamoHandler } from './prestamo.handler.js';
import { CreatePrestamoDto, ListPrestamoQueryDto, PrestamoResponseDto, RegistrarRetornoDto } from './prestamo.dto.js';

@ApiTags('almacen/prestamos')
@Controller('almacen/prestamos')
export class PrestamoController {
  constructor(private readonly handler: PrestamoHandler) {}

  @Get()
  @ApiOperation({ summary: 'Listar préstamos con estado del plazo y días fuera' })
  @ApiOkResponse({ description: 'Lista paginada' })
  list(@Query() query: ListPrestamoQueryDto): Promise<Paginated<PrestamoResponseDto>> {
    return this.handler.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener préstamo con líneas y retornos' })
  @ApiOkResponse({ type: PrestamoResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  getById(@Param('id', ParseIntPipe) id: number): Promise<PrestamoResponseDto> {
    return this.handler.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Registrar préstamo de equipos (reduce el disponible, no el stock total)' })
  @ApiCreatedResponse({ type: PrestamoResponseDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos o producto que no es equipo retornable' })
  @ApiConflictResponse({ description: 'Disponible insuficiente' })
  create(@Body() dto: CreatePrestamoDto): Promise<PrestamoResponseDto> {
    return this.handler.registrar(dto);
  }

  @Post(':id/retornos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registrar retorno (total o parcial) con la condición de cada línea' })
  @ApiOkResponse({ type: PrestamoResponseDto })
  @ApiBadRequestResponse({ description: 'Cantidad mayor a la pendiente o línea ajena' })
  @ApiConflictResponse({ description: 'Préstamo cerrado o anulado' })
  registrarRetorno(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarRetornoDto): Promise<PrestamoResponseDto> {
    return this.handler.registrarRetorno(id, dto);
  }

  @Post(':id/anular')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anular préstamo sin retornos (libera lo reservado)' })
  @ApiOkResponse({ type: PrestamoResponseDto })
  @ApiConflictResponse({ description: 'Ya tiene retornos o no está abierto' })
  anular(@Param('id', ParseIntPipe) id: number): Promise<PrestamoResponseDto> {
    return this.handler.anular(id);
  }
}
