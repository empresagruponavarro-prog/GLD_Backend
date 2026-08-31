import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetMenuQueryDto, type MenuSection } from './menu.dto.js';
import { MenuHandler } from './menu.handler.js';

@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly handler: MenuHandler) {}

  @Get()
  @ApiOperation({ summary: 'Obtener el menú del sidebar filtrado por rol' })
  getByRole(@Query() query: GetMenuQueryDto): MenuSection[] {
    return this.handler.getByRole(query.rol);
  }
}