import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export class CreatePresupuestoPrincipalDto {
  @ApiProperty({ example: 'PPTO-2026-001', description: 'Código único del presupuesto' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  IdPresupuesto: string;

  @ApiPropertyOptional({ example: 1, description: 'Identificador de empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_empresa?: number;

  @ApiPropertyOptional({ example: 2026, description: 'ID o año del periodo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  periodo?: number;

  @ApiPropertyOptional({ example: 'V1', description: 'Versión del presupuesto' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Version?: string;

  @ApiPropertyOptional({ example: 'OBRA', description: 'Tipo de presupuesto' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  TipoPpto?: string;

  @ApiPropertyOptional({ example: 'CONSTRUCCION EDIFICIO MULTIFAMILIAR', description: 'Nombre del proyecto' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Proyecto?: string;

  @ApiPropertyOptional({ example: 'Presupuesto base de obra civil y acabados', description: 'Concepto o alcance' })
  @IsOptional()
  @IsString()
  Concepto?: string;

  @ApiPropertyOptional({ example: '617d63d6', description: 'Centro de costo principal' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodCentroCtoPrincipal?: string;

  @ApiPropertyOptional({ example: 'a47efc23', description: 'Código de Centro de Costo asignado' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodCentroCto?: string;

  @ApiPropertyOptional({ example: 42, description: 'ID del Centro de Costo asignado (FK)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_centro_costo?: number;

  @ApiPropertyOptional({ example: '2026-01-15', description: 'Fecha de requerimiento' })
  @IsOptional()
  @IsString()
  FechaRequerimiento?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Fecha de entrega' })
  @IsOptional()
  @IsString()
  FechaEntrega?: string;

  @ApiPropertyOptional({ example: 150000.00, description: 'Costo Directo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  CostoDirecto?: number;

  @ApiPropertyOptional({ example: 10, description: 'Porcentaje de Gastos Generales (ej. 10 para 10%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  GGPorcentaje?: number;

  @ApiPropertyOptional({ example: 15000.00, description: 'Gastos Generales calculados' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  GastosGenerales?: number;

  @ApiPropertyOptional({ example: 10, description: 'Porcentaje de Utilidad' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  UtiliPorcentaje?: number;

  @ApiPropertyOptional({ example: 15000.00, description: 'Utilidad calculada' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  Utilidad?: number;

  @ApiPropertyOptional({ example: 5000.00, description: 'Viáticos' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  Viaticos?: number;

  @ApiPropertyOptional({ example: 0, description: 'Descuento comercial' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  DsctoComercial?: number;

  @ApiPropertyOptional({ example: 'APROBADO', description: 'Estado del presupuesto (APROBADO, PENDIENTE, RECHAZADO)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  Estado?: string;

  @ApiPropertyOptional({ description: 'Comentarios adicionales' })
  @IsOptional()
  @IsString()
  Comentarios?: string;

  @ApiPropertyOptional({ description: 'Usuario creador' })
  @IsOptional()
  @IsString()
  Usuario?: string;
}

export class UpdatePresupuestoPrincipalDto extends PartialType(CreatePresupuestoPrincipalDto) {}

export class ListPresupuestoPrincipalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Búsqueda por texto (código o proyecto)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtro por Centro de Costo' })
  @IsOptional()
  @IsString()
  CodCentroCto?: string;

  @ApiPropertyOptional({ description: 'Filtro por ID de Centro de Costo (FK)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id_centro_costo?: number;

  @ApiPropertyOptional({ description: 'Filtro por Estado' })
  @IsOptional()
  @IsString()
  Estado?: string;

  @ApiPropertyOptional({ description: 'Filtro por Empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id_empresa?: number;

  @ApiPropertyOptional({ description: 'Filtro por Periodo' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  periodo?: number;
}

export class PresupuestoPrincipalResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'PPTO-2026-001' })
  IdPresupuesto: string | null;

  @ApiPropertyOptional({ example: 1 })
  id_empresa: number | null;

  @ApiPropertyOptional({ example: 2026 })
  periodo: number | null;

  @ApiPropertyOptional({ example: 'V1' })
  Version: string | null;

  @ApiPropertyOptional({ example: 'OBRA' })
  TipoPpto: string | null;

  @ApiPropertyOptional({ example: 'CONSTRUCCION MULTIFAMILIAR' })
  Proyecto: string | null;

  @ApiPropertyOptional({ example: 'Presupuesto de obra civil' })
  Concepto: string | null;

  @ApiPropertyOptional({ example: 'a47efc23' })
  CodCentroCto: string | null;

  @ApiPropertyOptional({ example: 42 })
  id_centro_costo: number | null;

  @ApiPropertyOptional({ example: '2026-01-15' })
  FechaRequerimiento: string | null;

  @ApiPropertyOptional({ example: '2026-06-30' })
  FechaEntrega: string | null;

  @ApiPropertyOptional({ example: '150000.00' })
  CostoDirecto: string | null;

  @ApiPropertyOptional({ example: '10.00' })
  GGPorcentaje: string | null;

  @ApiPropertyOptional({ example: '15000.00' })
  GastosGenerales: string | null;

  @ApiPropertyOptional({ example: '10.00' })
  UtiliPorcentaje: string | null;

  @ApiPropertyOptional({ example: '15000.00' })
  Utilidad: string | null;

  @ApiPropertyOptional({ example: '5000.00' })
  Viaticos: string | null;

  @ApiPropertyOptional({ example: '0.00' })
  DsctoComercial: string | null;

  @ApiPropertyOptional({ example: '185000.00' })
  SubTotalSinIGV: string | null;

  @ApiPropertyOptional({ example: '33300.00' })
  IGV: string | null;

  @ApiPropertyOptional({ example: '218300.00' })
  Total: string | null;

  @ApiPropertyOptional({ example: 'APROBADO' })
  Estado: string | null;

  @ApiPropertyOptional()
  Comentarios: string | null;

  @ApiPropertyOptional()
  Usuario: string | null;

  @ApiPropertyOptional()
  FechaCreacion: string | null;
}
