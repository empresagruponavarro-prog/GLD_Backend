import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { AdjudicacionHandler } from './adjudicacion.handler.js';
import { CotizacionPptoHandler } from './cotizacion-ppto.handler.js';
import {
  AdjudicacionDto,
  AdjudicacionResponseDto,
  CreatePptoCotizacionDto,
  PptoCotizacionResponseDto,
  PptoCuadroComparativoDto,
  UpdatePptoCotizacionDto,
} from './cotizacion-ppto.dto.js';

@ApiTags('presupuestos / cotizaciones por ítem')
@Controller('presupuestos/:id')
@Modulo('presupuestos')
@ApiParam({ name: 'id', type: Number, description: 'ID del presupuesto (`ppto_Principal.id`)' })
export class CotizacionPptoController {
  constructor(
    private readonly handler: CotizacionPptoHandler,
    private readonly adjudicacion: AdjudicacionHandler,
  ) {}

  @Get('cotizaciones')
  @ApiOperation({ summary: 'Cotizaciones del presupuesto (todas o de una fase), con líneas y totales sin/con IGV' })
  @ApiQuery({ name: 'id_detalle_fase', required: false, type: Number })
  @ApiOkResponse({ type: PptoCotizacionResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'El presupuesto no existe' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_detalle_fase', new ParseIntPipe({ optional: true })) idFase?: number,
  ): Promise<PptoCotizacionResponseDto[]> {
    return this.handler.list(id, idFase);
  }

  @Post('cotizaciones')
  @Accion('editar')
  @ApiOperation({
    summary: 'Registra la cotización de un proveedor para una fase del presupuesto (una línea por ítem)',
    description: 'Con `adjudicar: true` en una línea, ese proveedor gana el ítem. Un proveedor por fase.',
  })
  @ApiCreatedResponse({ type: PptoCotizacionResponseDto })
  @ApiBadRequestResponse({ description: 'Ítems que no son de la fase, cantidades inválidas o proveedor que no es un Proveedor' })
  @ApiConflictResponse({ description: 'El proveedor ya cotizó la fase, el presupuesto no admite cambios o falta el trabajador vinculado' })
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePptoCotizacionDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<PptoCotizacionResponseDto> {
    return this.handler.create(id, dto, user);
  }

  @Get('cuadro-comparativo')
  @ApiOperation({ summary: 'Cuadro comparativo ítem × proveedor de una fase (no sugiere ganador)' })
  @ApiQuery({ name: 'id_detalle_fase', required: true, type: Number })
  @ApiOkResponse({ type: PptoCuadroComparativoDto })
  @ApiBadRequestResponse({ description: 'La fase no es del presupuesto' })
  cuadro(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_detalle_fase', ParseIntPipe) idFase: number,
  ): Promise<PptoCuadroComparativoDto> {
    return this.handler.cuadroComparativo(id, idFase);
  }

  @Get('cotizaciones/:idCot')
  @ApiOperation({ summary: 'Detalle de una cotización del presupuesto' })
  @ApiOkResponse({ type: PptoCotizacionResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  get(@Param('id', ParseIntPipe) id: number, @Param('idCot', ParseIntPipe) idCot: number): Promise<PptoCotizacionResponseDto> {
    return this.handler.getById(id, idCot);
  }

  @Patch('cotizaciones/:idCot')
  @ApiOperation({ summary: 'Edita la cotización; si llegan líneas las reemplaza conservando el ganador de las que siguen' })
  @ApiOkResponse({ type: PptoCotizacionResponseDto })
  @ApiConflictResponse({ description: 'Alguno de sus ítems ya tiene una orden registrada' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Param('idCot', ParseIntPipe) idCot: number,
    @Body() dto: UpdatePptoCotizacionDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<PptoCotizacionResponseDto> {
    return this.handler.update(id, idCot, dto, user);
  }

  @Delete('cotizaciones/:idCot')
  @Accion('editar')
  @ApiOperation({ summary: 'Elimina la cotización (sus ítems ganados quedan sin ganador)' })
  @ApiConflictResponse({ description: 'Alguno de sus ítems ya tiene una orden registrada' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Param('idCot', ParseIntPipe) idCot: number,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.handler.delete(id, idCot, user);
  }

  @Put('adjudicacion')
  @ApiOperation({
    summary: 'Elige o quita el ganador de ítems del presupuesto',
    description: 'Cada ítem va completo a un solo proveedor. El sistema no sugiere ni exige el más barato.',
  })
  @ApiOkResponse({ type: AdjudicacionResponseDto })
  @ApiConflictResponse({ description: 'Un ítem ya tiene una orden registrada, o el usuario no tiene un trabajador vinculado' })
  adjudicar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjudicacionDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<AdjudicacionResponseDto> {
    return this.adjudicacion.adjudicar(id, dto, user);
  }
}
