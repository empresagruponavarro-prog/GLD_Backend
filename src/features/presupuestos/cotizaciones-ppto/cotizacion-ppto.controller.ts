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

@ApiTags('presupuestos / cotizaciones por subpartida')
@Controller('presupuestos/:id')
@Modulo('presupuestos')
@ApiParam({ name: 'id', type: Number, description: 'ID del presupuesto (`ppto_Principal.id`)' })
export class CotizacionPptoController {
  constructor(
    private readonly handler: CotizacionPptoHandler,
    private readonly adjudicacion: AdjudicacionHandler,
  ) {}

  @Get('cotizaciones')
  @ApiOperation({ summary: 'Cotizaciones del presupuesto (todas, de una fase o de una subpartida), con líneas y totales sin/con IGV' })
  @ApiQuery({ name: 'id_detalle_fase', required: false, type: Number })
  @ApiQuery({ name: 'id_detalle_categoria', required: false, type: Number, description: '`ppto_DetalleFasesCate.id` (la subpartida)' })
  @ApiOkResponse({ type: PptoCotizacionResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'El presupuesto no existe' })
  list(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_detalle_fase', new ParseIntPipe({ optional: true })) idFase?: number,
    @Query('id_detalle_categoria', new ParseIntPipe({ optional: true })) idSubpartida?: number,
  ): Promise<PptoCotizacionResponseDto[]> {
    return this.handler.list(id, idFase, idSubpartida);
  }

  @Post('cotizaciones')
  @Accion('editar')
  @ApiOperation({
    summary: 'Registra la cotización de un proveedor para una subpartida del presupuesto (un total que se prorratea entre sus ítems)',
    description:
      'El proveedor da un solo total por toda la subpartida; el sistema lo reparte entre sus ítems según el costo Meta. ' +
      'Con `adjudicar: true` ese proveedor gana la subpartida completa. Un proveedor por subpartida.',
  })
  @ApiCreatedResponse({ type: PptoCotizacionResponseDto })
  @ApiBadRequestResponse({ description: 'Subpartida que no es del presupuesto, total inválido, subpartida sin costo Meta o proveedor que no es un Proveedor' })
  @ApiConflictResponse({ description: 'El proveedor ya cotizó la subpartida, el presupuesto no admite cambios o falta el trabajador vinculado' })
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreatePptoCotizacionDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<PptoCotizacionResponseDto> {
    return this.handler.create(id, dto, user);
  }

  @Get('cotizaciones/sugeridas')
  @ApiOperation({ summary: 'Condiciones que se proponen al cotizar la subpartida (adelanto, garantía) según su tipo de servicio' })
  @ApiQuery({ name: 'id_detalle_categoria', required: true, type: Number })
  sugeridas(@Query('id_detalle_categoria', ParseIntPipe) idSubpartida: number) {
    return this.handler.condicionesSugeridas(idSubpartida);
  }

  @Get('cuadro-comparativo')
  @ApiOperation({ summary: 'Cuadro comparativo de una subpartida: un total por proveedor y su desglose por ítem (no sugiere ganador)' })
  @ApiQuery({ name: 'id_detalle_categoria', required: true, type: Number })
  @ApiOkResponse({ type: PptoCuadroComparativoDto })
  @ApiBadRequestResponse({ description: 'La subpartida no es del presupuesto' })
  cuadro(
    @Param('id', ParseIntPipe) id: number,
    @Query('id_detalle_categoria', ParseIntPipe) idSubpartida: number,
  ): Promise<PptoCuadroComparativoDto> {
    return this.handler.cuadroComparativo(id, idSubpartida);
  }

  @Get('cotizaciones/:idCot')
  @ApiOperation({ summary: 'Detalle de una cotización del presupuesto' })
  @ApiOkResponse({ type: PptoCotizacionResponseDto })
  @ApiNotFoundResponse({ description: 'No existe' })
  get(@Param('id', ParseIntPipe) id: number, @Param('idCot', ParseIntPipe) idCot: number): Promise<PptoCotizacionResponseDto> {
    return this.handler.getById(id, idCot);
  }

  @Patch('cotizaciones/:idCot')
  @ApiOperation({ summary: 'Edita la cotización; si llega un `total` se vuelve a prorratear conservando el ganador si sigue valiendo' })
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
    summary: 'Elige o quita el ganador de una subpartida del presupuesto',
    description: 'La subpartida completa va a un solo proveedor. El sistema no sugiere ni exige el más barato.',
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
