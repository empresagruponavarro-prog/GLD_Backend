import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetMenuQueryDto, MenuSectionResponseDto } from './menu.dto.js';
import { MenuHandler } from './menu.handler.js';
import { LecturaCompartida } from '../../platform/auth/permisos.decorator.js';

@ApiTags('menu')
@Controller('menu')
@LecturaCompartida()
export class MenuController {
  constructor(private readonly handler: MenuHandler) {}

  @Get()
  @ApiOperation({ summary: 'Obtener el menú del sidebar filtrado por rol' })
  @ApiOkResponse({
    type: [MenuSectionResponseDto],
    description: 'Estructura de navegación del sidebar según el rol proporcionado',
  })
  getByRole(@Query() query: GetMenuQueryDto): MenuSectionResponseDto[] {
    return this.handler.getByRole(query.rol);
  }
}