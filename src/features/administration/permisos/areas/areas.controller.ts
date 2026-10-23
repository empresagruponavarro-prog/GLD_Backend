import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../../../../platform/auth/jwt/auth-user.js';
import { CurrentUser } from '../../../../platform/auth/decorators/current-user.decorator.js';
import { Modulo } from '../../../../platform/auth/decorators/permisos.decorator.js';
import { ActualizarModulosAreaDto, AreaMatrizDto, MatrizAreasDto } from './areas.dto.js';
import { AreasPermisosHandler } from './areas.handler.js';

@ApiTags('administration/permisos')
@Controller('administration/permisos/areas')
@Modulo('admin.roles')
@ApiUnauthorizedResponse({ description: 'Sin sesión' })
@ApiForbiddenResponse({ description: 'Sin permiso en Roles y permisos (403 SIN_PERMISO) o usuario desactivado' })
export class AreasPermisosController {
  constructor(private readonly handler: AreasPermisosHandler) {}

  @Get()
  @ApiOperation({
    summary: 'Matriz de módulos por área',
    description:
      'Módulos activos del catálogo y, por cada área, los que tiene habilitados (solo ver / completo). ' +
      '`sin_area` lista los módulos que no están en ninguna área. Un área sin módulos configurados no restringe a sus usuarios.',
  })
  @ApiOkResponse({ type: MatrizAreasDto })
  matriz(): Promise<MatrizAreasDto> {
    return this.handler.matriz();
  }

  @Put(':idArea')
  @ApiOperation({
    summary: 'Reemplazar los módulos de un área',
    description:
      'Reemplaza todos los módulos del área en una transacción (los que no vengan quedan sin acceso). ' +
      'Los módulos de Administración y el menú de módulos no dependen del área.',
  })
  @ApiParam({ name: 'idArea', type: Number, example: 1 })
  @ApiOkResponse({ type: AreaMatrizDto, description: 'Área con sus módulos ya guardados' })
  @ApiBadRequestResponse({ description: 'Cuerpo inválido, módulo desconocido/inactivo/repetido o que no depende del área' })
  @ApiNotFoundResponse({ description: 'Área no encontrada' })
  reemplazar(
    @Param('idArea', ParseIntPipe) idArea: number,
    @Body() dto: ActualizarModulosAreaDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AreaMatrizDto> {
    return this.handler.reemplazar(idArea, dto.modulos, user.id);
  }
}
