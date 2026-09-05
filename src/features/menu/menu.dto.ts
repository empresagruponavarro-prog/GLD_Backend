import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ROLES, type MenuItemDef, type MenuSectionDef } from './menu.definition.js';

export class GetMenuQueryDto {
  @ApiPropertyOptional({
    description: 'Rol para filtrar el menú. Si se omite, se devuelve el menú completo.',
    enum: ROLES,
  })
  @IsOptional()
  @IsString()
  @IsIn(ROLES)
  rol?: string;
}

export type MenuItem = Omit<MenuItemDef, 'roles'>;

export type MenuSection = Omit<MenuSectionDef, 'roles'>;