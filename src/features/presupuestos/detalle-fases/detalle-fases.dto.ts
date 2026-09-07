import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export class CreatePptoDetalleFaseDto {
  @ApiProperty({ example: 'DF-001', description: 'Código único de detalle de fase' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdPresupuestoDetalle: string;

  @ApiProperty({ example: 'PPTO-2026-001', description: 'IdPresupuesto padre' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdPresupuesto: string;

  @ApiProperty({ example: 'FASE-01', description: 'Código IdpptoFase maestro' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdpptoFase: string;

  @ApiPropertyOptional({ example: 'E1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodEmpresa?: string;

  @ApiPropertyOptional({ example: '617d63d6' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodCentroCtoPrincipal?: string;

  @ApiPropertyOptional({ example: 'a47efc23' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodCentroCto?: string;

  @ApiPropertyOptional({ example: 45000.00, description: 'Costo directo de la fase' })
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

export class UpdatePptoDetalleFaseDto extends PartialType(CreatePptoDetalleFaseDto) {}

export class ListPptoDetalleFaseQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filtro por IdPresupuesto' })
  @IsOptional()
  @IsString()
  IdPresupuesto?: string;

  @ApiPropertyOptional({ description: 'Filtro por IdpptoFase' })
  @IsOptional()
  @IsString()
  IdpptoFase?: string;
}

export class PptoDetalleFaseResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'DF-001' })
  IdPresupuestoDetalle: string | null;

  @ApiPropertyOptional({ example: 'PPTO-2026-001' })
  IdPresupuesto: string | null;

  @ApiPropertyOptional({ example: 'FASE-01' })
  IdpptoFase: string | null;

  @ApiPropertyOptional({ example: 'E1' })
  CodEmpresa: string | null;

  @ApiPropertyOptional({ example: 'a47efc23' })
  CodCentroCto: string | null;

  @ApiPropertyOptional({ example: '45000.00' })
  CostoDirecto: string | null;

  @ApiPropertyOptional({ example: 'admin@luadag.com' })
  Usuario: string | null;

  @ApiPropertyOptional()
  FechaCreacion: string | null;
}
