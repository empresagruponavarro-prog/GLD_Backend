import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Accion, Modulo } from '../../../platform/auth/decorators/permisos.decorator.js';
import { CurrentUser } from '../../../platform/auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import {
  AprobarPresupuestoResponseDto,
  ComercialResponseDto,
  LimpiarVaciosResponseDto,
  NuevaVersionResponseDto,
  ValidacionPresupuestoResponseDto,
} from './aprobacion.dto.js';
import { AprobacionPresupuestoHandler } from './aprobacion.handler.js';

@ApiTags('presupuestos / aprobación')
@Controller('presupuestos')
@Modulo('presupuestos')
export class AprobacionPresupuestoController {
  constructor(private readonly handler: AprobacionPresupuestoHandler) {}

  @Get(':idOrCode/validacion')
  @ApiOperation({ summary: 'Qué falta para aprobar el presupuesto: problemas del presupuesto y bloqueos de negocio' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  @ApiOkResponse({ type: ValidacionPresupuestoResponseDto })
  validacion(@Param('idOrCode') idOrCode: string) {
    return this.handler.validacion(idOrCode);
  }

  @Get(':idOrCode/comercial')
  @ApiOperation({ summary: 'Presupuesto Comercial calculado: cada fase del Meta con el monto de su cotización ganadora (o el del Meta si aún no tiene)' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  @ApiOkResponse({ type: ComercialResponseDto })
  comercial(@Param('idOrCode') idOrCode: string) {
    return this.handler.comercial(idOrCode);
  }

  @Post(':idOrCode/limpiar-vacios')
  @Accion('editar') // es un POST, pero modifica un presupuesto existente: exige «editar», no «crear»
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Elimina los ítems en cero y las categorías sin ítems, y recalcula los costos' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  @ApiOkResponse({ type: LimpiarVaciosResponseDto })
  limpiarVacios(@Param('idOrCode') idOrCode: string) {
    return this.handler.limpiarVacios(idOrCode);
  }

  @Post(':idOrCode/aprobar')
  @Accion('aprobar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aprueba el presupuesto y captura la estructura de la obra (partidas y subpartidas) en la misma transacción',
  })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  @ApiOkResponse({ type: AprobarPresupuestoResponseDto })
  aprobar(@Param('idOrCode') idOrCode: string, @CurrentUser() user?: AuthUser) {
    return this.handler.aprobar(idOrCode, user?.usuario);
  }

  @Post(':idOrCode/nueva-version')
  @ApiOperation({ summary: 'Crea una nueva versión del presupuesto Principal (solo si la obra no tiene avance)' })
  @ApiParam({ name: 'idOrCode', description: 'ID numérico o código IdPresupuesto' })
  @ApiCreatedResponse({ type: NuevaVersionResponseDto })
  nuevaVersion(@Param('idOrCode') idOrCode: string, @CurrentUser() user?: AuthUser) {
    return this.handler.nuevaVersion(idOrCode, user?.usuario);
  }
}
