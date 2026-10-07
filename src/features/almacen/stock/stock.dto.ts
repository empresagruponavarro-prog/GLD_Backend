import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { DECIMAL_REGEX } from '../documentos/documento.dto.js';

export const ALERTAS = ['OK', 'SIN_STOCK', 'BAJO_MINIMO', 'EQUIPO_NO_OPERATIVO'] as const;
export const CLASES = ['CONSUMIBLE', 'EQUIPO_RETORNABLE', 'MERCADERIA_CLIENTE'] as const;

export class ListStockQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Si se indica, las cantidades son solo de ese almacén' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_almacen?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_categoria?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_familia?: number;

  @ApiPropertyOptional({ enum: CLASES })
  @IsOptional()
  @IsIn(CLASES)
  clase_inventario?: (typeof CLASES)[number];

  @ApiPropertyOptional({ enum: ALERTAS })
  @IsOptional()
  @IsIn(ALERTAS)
  alerta?: (typeof ALERTAS)[number];

  @ApiPropertyOptional({ description: 'Texto parcial en código o descripción' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: false, description: 'Incluir productos sin existencias ni mínimo configurado' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluir_sin_stock?: boolean;
}

export class StockResponseDto {
  @ApiProperty() id_producto: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty() categoria: string;
  @ApiPropertyOptional({ example: 'CON' }) familia: string | null;
  @ApiProperty({ enum: CLASES }) clase_inventario: string;
  @ApiPropertyOptional() almacen_default: string | null;
  @ApiProperty({ example: '86' }) stock_total: string;
  @ApiProperty({ example: '2' }) prestado: string;
  @ApiProperty({ example: '1' }) no_operativo: string;
  @ApiProperty({ example: '83', description: 'stock_total - prestado - no_operativo' }) disponible: string;
  @ApiProperty({ example: '10' }) stock_minimo: string;
  @ApiProperty({ example: '20' }) stock_objetivo: string;
  @ApiProperty({ example: '0', description: 'Solo no retornables con disponible <= mínimo: objetivo - disponible' })
  compra_sugerida: string;
  @ApiProperty({ example: '20.837209' }) costo_promedio: string;
  @ApiProperty({ example: '1792.04', description: 'stock_total * costo_promedio' }) valor_total: string;
  @ApiProperty({ enum: ALERTAS }) alerta: string;
}

export class MarcarOperativoDto {
  @ApiProperty({ example: '1', description: 'Unidades no operativas que vuelven a disponibles' })
  @Matches(DECIMAL_REGEX, { message: 'cantidad debe ser un decimal positivo' })
  cantidad: string;
}

export class StockAlmacenResponseDto {
  @ApiProperty() id_almacen: number;
  @ApiProperty() almacen: string;
  @ApiProperty() cantidad: string;
  @ApiProperty() prestado: string;
  @ApiProperty() no_operativo: string;
  @ApiProperty() disponible: string;
}
