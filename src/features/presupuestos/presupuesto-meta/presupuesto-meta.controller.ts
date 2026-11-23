import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { PartidaItemsResponseDto } from '../plantillas-items/plantillas-items.dto.js';
import {
  AjusteMetaDto,
  MetaSubfaseDto,
  MetaSubfaseNodoDto,
  PresupuestoMetaResponseDto,
  SyncItemsMetaDto,
} from './presupuesto-meta.dto.js';
import { PresupuestoMetaHandler } from './presupuesto-meta.handler.js';

const ESTADO_NO_EDITABLE = 'El presupuesto no está en desarrollo, en revisión ni observado';

@ApiTags('presupuestos / presupuesto meta')
@Controller('presupuestos')
@Modulo('presupuestos')
export class PresupuestoMetaController {
  constructor(private readonly handler: PresupuestoMetaHandler) {}

  @Get(':idOrCode/meta')
  @ApiOperation({
    summary: 'Presupuesto Meta: Base vs Meta de cada fase, subfase e ítem, con las diferencias',
    description: 'El Meta de un ítem sin precio Meta propio vale su Base. La Liquidación Financiera (GG, utilidad, IGV, total) se calcula sobre el Base.',
  })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  @ApiOkResponse({ type: PresupuestoMetaResponseDto })
  @ApiNotFoundResponse({ description: 'El presupuesto no existe' })
  get(@Param('idOrCode') idOrCode: string): Promise<PresupuestoMetaResponseDto> {
    return this.handler.getMeta(idOrCode);
  }

  @Put('categorias-asignadas/:idCat/items-meta')
  @ApiOperation({
    summary: 'Fija el precio Meta de ítems de la subfase (null = vuelve al Base). Los ítems que no vienen no cambian',
    description:
      'Vuelve a repartir las cotizaciones de la subfase con los nuevos pesos (el total de cada proveedor no cambia) y concilia los compromisos. ' +
      'Las cotizaciones con una orden registrada no se tocan y se informan en `reprorrateo.omitidas`.',
  })
  @ApiParam({ name: 'idCat', description: '`ppto_DetalleFasesCate.id` (la subfase)' })
  @ApiOkResponse({ type: PartidaItemsResponseDto })
  @ApiBadRequestResponse({ description: 'Ítems repetidos o que no son de la subfase, o precio Meta menor a S/ 0.01' })
  @ApiConflictResponse({ description: ESTADO_NO_EDITABLE })
  @ApiNotFoundResponse({ description: 'La subfase no existe' })
  syncItemsMeta(
    @Param('idCat', ParseIntPipe) idCat: number,
    @Body() dto: SyncItemsMetaDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<PartidaItemsResponseDto> {
    return this.handler.syncItemsMeta(idCat, dto, user);
  }

  @Post('categorias-asignadas/:idCat/meta/ajuste')
  @Accion('editar') // es un POST, pero modifica precios de ítems existentes: exige «editar», no «crear»
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aplica un % sobre el precio Base de todos los ítems de la subfase (su precio Meta pasa a ser el resultado)',
    description: 'Los ítems sin precio Base quedan como están. Si el % dejaría algún precio por debajo de S/ 0.01, no se aplica a ninguno.',
  })
  @ApiParam({ name: 'idCat', description: '`ppto_DetalleFasesCate.id` (la subfase)' })
  @ApiOkResponse({ type: PartidaItemsResponseDto })
  @ApiBadRequestResponse({ description: 'La subfase no tiene ítems o el % deja un precio Meta inválido' })
  @ApiConflictResponse({ description: ESTADO_NO_EDITABLE })
  @ApiNotFoundResponse({ description: 'La subfase no existe' })
  ajuste(
    @Param('idCat', ParseIntPipe) idCat: number,
    @Body() dto: AjusteMetaDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<PartidaItemsResponseDto> {
    return this.handler.ajustarSubfase(idCat, dto, user);
  }

  @Put('categorias-asignadas/:idCat/meta')
  @ApiOperation({
    summary: 'Monto Meta escrito a mano de una subfase sin ítems (null = igual al Base)',
    description: 'Una subfase con ítems no admite monto a mano: su Meta es la suma de sus ítems.',
  })
  @ApiParam({ name: 'idCat', description: '`ppto_DetalleFasesCate.id` (la subfase)' })
  @ApiOkResponse({ type: MetaSubfaseNodoDto })
  @ApiConflictResponse({ description: `La subfase tiene ítems, o ${ESTADO_NO_EDITABLE.toLowerCase()}` })
  @ApiNotFoundResponse({ description: 'La subfase no existe' })
  fijarMeta(
    @Param('idCat', ParseIntPipe) idCat: number,
    @Body() dto: MetaSubfaseDto,
    @CurrentUser() user?: AuthUser,
  ): Promise<MetaSubfaseNodoDto> {
    return this.handler.fijarMetaSubfase(idCat, dto, user);
  }
}
