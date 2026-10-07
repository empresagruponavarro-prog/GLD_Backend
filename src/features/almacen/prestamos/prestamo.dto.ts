import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { DECIMAL_REGEX, FECHA_REGEX } from '../documentos/documento.dto.js';

export const CONDICIONES = ['OPERATIVO', 'NO_OPERATIVO', 'CON_FALTANTES', 'DANADO'] as const;
export const ESTADOS_PRESTAMO = ['ABIERTO', 'PARCIAL', 'CERRADO', 'ANULADO'] as const;
export const ESTADOS_PLAZO = [
  'EN_PLAZO',
  'VENCE_HOY',
  'VENCIDO',
  'RETORNADO_A_TIEMPO',
  'RETORNADO_CON_RETRASO',
  'ANULADO',
] as const;

export class PrestamoLineaDto {
  @ApiProperty({ example: 5, description: 'Producto con clase EQUIPO_RETORNABLE' })
  @IsInt()
  @Min(1)
  id_producto: number;

  @ApiProperty({ example: '2' })
  @Matches(DECIMAL_REGEX, { message: 'cantidad debe ser un decimal positivo' })
  cantidad: string;
}

export class CreatePrestamoDto {
  @ApiProperty({ example: '2026-10-06' })
  @Matches(FECHA_REGEX, { message: 'fecha_prestamo debe tener formato YYYY-MM-DD' })
  fecha_prestamo: string;

  @ApiProperty({ example: 1, description: 'Almacén desde el que se presta' })
  @IsInt()
  @Min(1)
  id_almacen: number;

  @ApiPropertyOptional({ description: 'Centro de costos (cliente / proyecto)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_centro_costo?: number;

  @ApiProperty({ description: 'Anexo tipo Trabajador que recibe los equipos' })
  @IsInt()
  @Min(1)
  id_responsable: number;

  @ApiPropertyOptional({ example: 'GR-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  documento_referencia?: string;

  @ApiProperty({ example: 7, description: 'Días autorizados; fecha prevista = fecha_prestamo + días' })
  @IsInt()
  @Min(1)
  dias_autorizados: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiProperty({ type: [PrestamoLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrestamoLineaDto)
  lineas: PrestamoLineaDto[];
}

export class RetornoItemDto {
  @ApiProperty({ example: 1, description: 'ID de la línea del préstamo' })
  @IsInt()
  @Min(1)
  id_prestamo_detalle: number;

  @ApiProperty({ example: '1' })
  @Matches(DECIMAL_REGEX, { message: 'cantidad debe ser un decimal positivo' })
  cantidad: string;

  @ApiProperty({ enum: CONDICIONES, description: 'NO_OPERATIVO y DANADO quedan no disponibles' })
  @IsIn(CONDICIONES)
  condicion: (typeof CONDICIONES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class RegistrarRetornoDto {
  @ApiProperty({ example: '2026-10-10' })
  @Matches(FECHA_REGEX, { message: 'fecha_retorno debe tener formato YYYY-MM-DD' })
  fecha_retorno: string;

  @ApiProperty({ type: [RetornoItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RetornoItemDto)
  retornos: RetornoItemDto[];
}

export class ListPrestamoQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ESTADOS_PRESTAMO })
  @IsOptional()
  @IsIn(ESTADOS_PRESTAMO)
  estado?: (typeof ESTADOS_PRESTAMO)[number];

  @ApiPropertyOptional({ enum: ESTADOS_PLAZO })
  @IsOptional()
  @IsIn(ESTADOS_PLAZO)
  estado_plazo?: (typeof ESTADOS_PLAZO)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_responsable?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_almacen?: number;

  @ApiPropertyOptional({ description: 'Texto parcial del número de préstamo' })
  @IsOptional()
  @IsString()
  numero?: string;
}

export class PrestamoLineaResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() id_producto: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty({ example: '2' }) cantidad: string;
  @ApiProperty({ example: '1' }) cantidad_devuelta: string;
  @ApiProperty({ example: '1' }) cantidad_pendiente: string;
}

export class PrestamoRetornoResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() id_prestamo_detalle: number;
  @ApiProperty({ example: '2026-10-10' }) fecha_retorno: string;
  @ApiProperty({ example: '1' }) cantidad: string;
  @ApiProperty({ enum: CONDICIONES }) condicion: string;
  @ApiPropertyOptional() observaciones: string | null;
}

export class PrestamoResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'PRE-000001' }) numero: string;
  @ApiProperty({ example: '2026-10-06' }) fecha_prestamo: string;
  @ApiProperty() id_almacen: number;
  @ApiProperty() almacen: string;
  @ApiPropertyOptional() id_centro_costo: number | null;
  @ApiPropertyOptional() centro_costo: string | null;
  @ApiProperty() id_responsable: number;
  @ApiProperty() responsable: string;
  @ApiPropertyOptional() documento_referencia: string | null;
  @ApiProperty() dias_autorizados: number;
  @ApiProperty({ example: '2026-10-13' }) fecha_prevista_retorno: string;
  @ApiProperty({ enum: ESTADOS_PRESTAMO }) estado: string;
  @ApiProperty({ enum: ESTADOS_PLAZO }) estado_plazo: string;
  @ApiProperty({ example: 3, description: 'Días fuera (hasta hoy, o hasta el último retorno si está cerrado)' }) dias_fuera: number;
  @ApiPropertyOptional() observaciones: string | null;
  @ApiProperty() created_at: string;
  @ApiProperty() total_lineas: number;
  @ApiPropertyOptional({ type: [PrestamoLineaResponseDto] }) lineas?: PrestamoLineaResponseDto[];
  @ApiPropertyOptional({ type: [PrestamoRetornoResponseDto] }) retornos?: PrestamoRetornoResponseDto[];
}
