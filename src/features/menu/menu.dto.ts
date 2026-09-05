import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ROLES } from './menu.definition.js';

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

export class MenuItemResponseDto {
  @ApiProperty({ example: 'producto' })
  key: string;

  @ApiProperty({ example: 'Productos' })
  label: string;

  @ApiProperty({ example: '/maestros/producto' })
  path: string;

  @ApiPropertyOptional({ example: 'inventory' })
  icon?: string;
}

export class MenuSectionResponseDto {
  @ApiProperty({ example: 'maestros' })
  key: string;

  @ApiProperty({ example: 'Maestros' })
  label: string;

  @ApiPropertyOptional({ example: 'inventory_2' })
  icon?: string;

  @ApiProperty({ type: [MenuItemResponseDto] })
  items: MenuItemResponseDto[];
}

export type MenuItem = MenuItemResponseDto;
export type MenuSection = MenuSectionResponseDto;