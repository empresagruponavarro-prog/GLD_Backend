import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export class CreatePptoDetalleFaseCateDto {
  @ApiProperty({ example: 'DFC-001', description: 'Código único de detalle de categoría' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdPresupuestoDetalleCategoria: string;

  @ApiPropertyOptional({ example: 'PPTO-2026-001', description: 'Código del presupuesto' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  IdPresupuesto?: string;

  @ApiProperty({ example: 'DF-001', description: 'Código de la fase asignada (IdPresupuestoDetalle)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdPresupuestoDetalle: string;

  @ApiProperty({ example: 'CAT-01', description: 'Código de categoría maestra (IdpptoFaseCategoria)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdpptoFaseCategoria: string;

  @ApiPropertyOptional({ example: 'FASE-01' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  IdpptoFase?: string;

  @ApiPropertyOptional({ example: 'E1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodEmpresa?: string;

  @ApiPropertyOptional({ example: 'a47efc23' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodCentroCto?: string;

  @ApiPropertyOptional({ example: 12500.00, description: 'Costo directo de la categoría' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  CostoDirecto?: number;

  @ApiPropertyOptional({ example: 'admin@luadag.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Usuario?: string;
}

export class UpdatePptoDetalleFaseCateDto extends PartialType(CreatePptoDetalleFaseCateDto) {}

export class ListPptoDetalleFaseCateQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtro por IdPresupuesto' })
  @IsOptional()
  @IsString()
  IdPresupuesto?: string;

  @ApiPropertyOptional({ description: 'Filtro por IdPresupuestoDetalle' })
  @IsOptional()
  @IsString()
  IdPresupuestoDetalle?: string;

  @ApiPropertyOptional({ description: 'Filtro por IdpptoFaseCategoria' })
  @IsOptional()
  @IsString()
  IdpptoFaseCategoria?: string;
}

export class PptoDetalleFaseCateResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'DFC-001' })
  IdPresupuestoDetalleCategoria: string | null;

  @ApiPropertyOptional({ example: 'PPTO-2026-001' })
  IdPresupuesto: string | null;

  @ApiPropertyOptional({ example: 'DF-001' })
  IdPresupuestoDetalle: string | null;

  @ApiPropertyOptional({ example: 'CAT-01' })
  IdpptoFaseCategoria: string | null;

  @ApiPropertyOptional({ example: '12500.00' })
  CostoDirecto: string | null;

  @ApiPropertyOptional({ example: 'admin@luadag.com' })
  Usuario: string | null;

  @ApiPropertyOptional()
  FechaCreacion: string | null;
}
