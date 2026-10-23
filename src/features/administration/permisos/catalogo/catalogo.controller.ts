import { Controller, Get } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GrupoCatalogoDto } from './catalogo.dto.js';
import { CatalogoPermisosHandler } from './catalogo.handler.js';
import { Modulo } from '../../../../platform/auth/decorators/permisos.decorator.js';

@ApiTags('administration/permisos')
@Controller('administration/permisos')
@Modulo('admin.roles')
export class CatalogoPermisosController {
  constructor(private readonly handler: CatalogoPermisosHandler) {}

  @Get('catalogo')
  @ApiOperation({
    summary: 'Catálogo de módulos agrupado',
    description: 'Solo módulos activos. Grupos y módulos en el orden de `orden`.',
  })
  @ApiOkResponse({ type: GrupoCatalogoDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Sin sesión' })
  @ApiForbiddenResponse({ description: 'Sin permiso en Roles y permisos (403 SIN_PERMISO) o usuario desactivado' })
  catalogo(): Promise<GrupoCatalogoDto[]> {
    return this.handler.catalogo();
  }
}
