import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateCuentaDto, CuentaResponseDto, UpdateCuentaDto } from '../tesoreria.dto.js';
import { CuentasHandler } from './cuentas.handler.js';
import { LecturaCompartida, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('tesoreria / cuentas')
@Controller('tesoreria/cuentas')
@Modulo('tesoreria.cuentas')
export class CuentasController {
  constructor(private readonly handler: CuentasHandler) {}

  @LecturaCompartida()
  @Get()
  @ApiOperation({ summary: 'Cuentas de pago (cajas, bancos, billeteras)' })
  @ApiQuery({ name: 'activas', required: false, type: Boolean })
  @ApiOkResponse({ type: CuentaResponseDto, isArray: true })
  list(@Query('activas') activas?: string): Promise<CuentaResponseDto[]> {
    return this.handler.list(activas === 'true');
  }

  @Post()
  @ApiOperation({ summary: 'Crear cuenta' })
  @ApiCreatedResponse({ type: CuentaResponseDto })
  @ApiConflictResponse({ description: 'Codigo duplicado' })
  create(@Body() dto: CreateCuentaDto): Promise<CuentaResponseDto> {
    return this.handler.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar o desactivar (codigo, tipo y moneda no se editan)' })
  @ApiOkResponse({ type: CuentaResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCuentaDto): Promise<CuentaResponseDto> {
    return this.handler.update(id, dto);
  }
}
