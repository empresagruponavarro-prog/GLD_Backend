import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Modulo } from '../../../../platform/auth/permisos.decorator.js';
import { SinPermisoErrorDto } from '../../../../platform/auth/sin-permiso.js';
import { AuditoriaPermisosQueryDto, ResumenAuditoriaPermisosDto } from './auditoria.dto.js';
import { AuditoriaPermisosHandler } from './auditoria.handler.js';

@ApiTags('administration/permisos')
@Controller('administration/permisos')
@Modulo('admin.roles')
export class AuditoriaPermisosController {
  constructor(private readonly handler: AuditoriaPermisosHandler) {}

  @Get('auditoria')
  @ApiOperation({
    summary: 'Resumen del registro de negativas de permisos',
    description:
      'Agrupa `logs/permisos-auditoria.jsonl` por módulo, acción, rol, método y ruta, ordenado por veces (desc). Para revisar el modo auditoría antes de pasar a estricto. Sin registro → [].',
  })
  @ApiOkResponse({ type: ResumenAuditoriaPermisosDto, isArray: true })
  @ApiBadRequestResponse({ description: '`desde` no es una fecha ISO 8601' })
  @ApiUnauthorizedResponse({ description: 'Sin sesión' })
  @ApiForbiddenResponse({ type: SinPermisoErrorDto, description: 'Sin permiso Ver en Roles y permisos' })
  resumen(@Query() query: AuditoriaPermisosQueryDto): Promise<ResumenAuditoriaPermisosDto[]> {
    return this.handler.resumen(query.desde === undefined ? undefined : new Date(query.desde));
  }
}
