import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import { Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { MarcarPlanoDto, PlanosRequeridosObraDto } from './planos-requeridos.dto.js';
import { PlanosRequeridosHandler } from './planos-requeridos.handler.js';

@ApiTags('Operaciones de Obra')
@Controller('operaciones/obra/:idCentroCosto/planos-requeridos')
@Modulo('obra')
@ApiParam({ name: 'idCentroCosto', type: Number })
export class PlanosRequeridosController {
  constructor(private readonly handler: PlanosRequeridosHandler) {}

  @Get()
  @ApiOperation({ summary: 'Lista de verificación de planos de la obra (copiada del tipo de proyecto) y lo que falta' })
  @ApiOkResponse({ type: PlanosRequeridosObraDto })
  listar(@Param('idCentroCosto', ParseIntPipe) idCentroCosto: number) {
    return this.handler.listar(idCentroCosto);
  }

  @Put(':idTipoPlano')
  @ApiOperation({ summary: 'Marca (o quita) el check de entregado de un plano de la lista' })
  @ApiParam({ name: 'idTipoPlano', type: Number })
  @ApiOkResponse({ type: PlanosRequeridosObraDto })
  marcar(
    @Param('idCentroCosto', ParseIntPipe) idCentroCosto: number,
    @Param('idTipoPlano', ParseIntPipe) idTipoPlano: number,
    @Body() dto: MarcarPlanoDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.handler.marcar(idCentroCosto, idTipoPlano, dto.entregado, user?.usuario);
  }
}
