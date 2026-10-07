import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { FECHA_REGEX } from '../documentos/documento.dto.js';

export class ListKardexQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Producto; recomendado para ver el saldo corrido' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_producto?: number;

  @ApiPropertyOptional({ description: 'Almacén' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_almacen?: number;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(FECHA_REGEX)
  desde?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(FECHA_REGEX)
  hasta?: string;
}

export class KardexResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: '2026-10-06' }) fecha: string;
  @ApiProperty({ example: 'COMPRA' }) movimiento: string;
  @ApiProperty({ example: 'ING-000002' }) documento: string;
  @ApiPropertyOptional({ example: 'F001-0023' }) documento_referencia: string | null;
  @ApiProperty() id_producto: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty() id_almacen: number;
  @ApiProperty() almacen: string;
  @ApiProperty({ example: '36' }) entrada: string;
  @ApiProperty({ example: '0' }) salida: string;
  @ApiProperty({ example: '86', description: 'Saldo del producto en ese almacén' }) saldo_almacen: string;
  @ApiProperty({ example: '86', description: 'Saldo del producto en todos los almacenes' }) saldo_total: string;
  @ApiProperty({ example: '22' }) costo_unitario: string;
  @ApiProperty({ example: '792' }) costo_total: string;
  @ApiProperty({ example: '20.837209' }) costo_promedio: string;
  @ApiPropertyOptional({ description: 'Proveedor, centro de costos o almacén destino según el documento' }) contraparte: string | null;
}
