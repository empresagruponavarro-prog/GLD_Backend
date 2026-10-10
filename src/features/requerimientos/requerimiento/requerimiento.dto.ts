import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export const ESTADOS_REQUERIMIENTO = ['BORRADOR', 'ENVIADO', 'OBSERVADO', 'APROBADO', 'RECHAZADO', 'ANULADO'] as const;
export type EstadoRequerimiento = (typeof ESTADOS_REQUERIMIENTO)[number];

export const ACCIONES_REQUERIMIENTO = ['CREAR', 'ENVIAR', 'OBSERVAR', 'APROBAR', 'RECHAZAR', 'ANULAR'] as const;
export type AccionRequerimiento = (typeof ACCIONES_REQUERIMIENTO)[number];

export const AVANCES_REQUERIMIENTO = ['SIN_ATENDER', 'PARCIAL', 'ATENDIDO'] as const;

export const DECIMAL_REGEX = /^\d{1,12}(\.\d{1,4})?$/;
export const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class RequerimientoLineaDto {
  @ApiProperty({ example: 1, description: 'Producto o servicio del catálogo' })
  @IsInt()
  @Min(1)
  id_producto: number;

  @ApiProperty({ example: '10', description: 'Cantidad > 0 como string decimal (hasta 4 decimales)' })
  @Matches(DECIMAL_REGEX, { message: 'cantidad debe ser un decimal positivo (hasta 4 decimales)' })
  cantidad: string;

  @ApiPropertyOptional({ example: '22.50' })
  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'precio_referencial debe ser un decimal no negativo' })
  precio_referencial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class CreateRequerimientoDto {
  @ApiProperty({ example: '2026-10-10', description: 'Fecha del requerimiento YYYY-MM-DD' })
  @Matches(FECHA_REGEX, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha: string;

  @ApiPropertyOptional({ example: '2026-10-20', description: 'Fecha en que se necesita lo solicitado' })
  @IsOptional()
  @Matches(FECHA_REGEX, { message: 'fecha_requerida debe tener formato YYYY-MM-DD' })
  fecha_requerida?: string;

  @ApiProperty({ example: 884, description: 'Centro de costos / proyecto' })
  @IsInt()
  @Min(1)
  id_centro_costo: number;

  @ApiPropertyOptional({ example: 3, description: 'Fase del presupuesto (ppto_Fases.id)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_fase?: number;

  @ApiProperty({ description: 'Anexo tipo Trabajador que solicita' })
  @IsInt()
  @Min(1)
  id_solicitante: number;

  @ApiPropertyOptional({ example: 'Sistemas' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiProperty({ example: 'Reposición de materiales para la fase de estructura' })
  @IsString()
  @MinLength(1)
  justificacion: string;

  @ApiProperty({ type: [RequerimientoLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequerimientoLineaDto)
  lineas: RequerimientoLineaDto[];
}

export class UpdateRequerimientoDto extends PartialType(CreateRequerimientoDto) {}

export class ListRequerimientoQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ESTADOS_REQUERIMIENTO })
  @IsOptional()
  @IsIn(ESTADOS_REQUERIMIENTO)
  estado?: EstadoRequerimiento;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_solicitante?: number;

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(FECHA_REGEX)
  desde?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(FECHA_REGEX)
  hasta?: string;

  @ApiPropertyOptional({ description: 'Búsqueda parcial por número o justificación' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class RequerimientoLineaResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() id_producto: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ enum: ['PRODUCTO', 'SERVICIO'] }) tipo_producto: string;
  @ApiProperty() unidad: string;
  @ApiProperty({ example: '10' }) cantidad: string;
  @ApiPropertyOptional({ example: '8', description: 'Se fija al aprobar' }) cantidad_aprobada: string | null;
  @ApiPropertyOptional() precio_referencial: string | null;
  @ApiPropertyOptional() observaciones: string | null;
  @ApiProperty({ example: '3', description: 'Suma de lo ordenado en OC' }) cantidad_ordenada: string;
  @ApiProperty({ example: '5', description: 'aprobada - ordenada (0 si no está aprobado)' }) saldo_por_ordenar: string;
}

export class RequerimientoEventoResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: ACCIONES_REQUERIMIENTO }) accion: string;
  @ApiPropertyOptional({ enum: ESTADOS_REQUERIMIENTO }) estado_anterior: string | null;
  @ApiProperty({ enum: ESTADOS_REQUERIMIENTO }) estado_nuevo: string;
  @ApiPropertyOptional() id_anexo: number | null;
  @ApiPropertyOptional() anexo: string | null;
  @ApiPropertyOptional() comentario: string | null;
  @ApiProperty() created_at: string;
}

export class RequerimientoOrdenCompraResponseDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional() id_oc: string | null;
  @ApiPropertyOptional() numero_oc: string | null;
  @ApiPropertyOptional() total: string | null;
  @ApiPropertyOptional() fecha_emision: string | null;
}

export class RequerimientoResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'FUR-000001' }) numero: string;
  @ApiProperty({ example: '2026-10-10' }) fecha: string;
  @ApiPropertyOptional() fecha_requerida: string | null;
  @ApiProperty() id_centro_costo: number;
  @ApiPropertyOptional() centro_costo: string | null;
  @ApiPropertyOptional() id_fase: number | null;
  @ApiPropertyOptional() fase: string | null;
  @ApiProperty() id_solicitante: number;
  @ApiPropertyOptional() solicitante: string | null;
  @ApiPropertyOptional() area: string | null;
  @ApiProperty() justificacion: string;
  @ApiProperty({ enum: ESTADOS_REQUERIMIENTO }) estado: string;
  @ApiPropertyOptional() id_aprobador: number | null;
  @ApiPropertyOptional() aprobador: string | null;
  @ApiPropertyOptional() fecha_aprobacion: string | null;
  @ApiPropertyOptional() comentario_aprobacion: string | null;
  @ApiPropertyOptional({ enum: AVANCES_REQUERIMIENTO, description: 'Solo con el FUR APROBADO' }) avance: string | null;
  @ApiProperty() created_at: string;
  @ApiProperty({ example: 3 }) total_lineas: number;
  @ApiPropertyOptional({ type: [RequerimientoLineaResponseDto] }) lineas?: RequerimientoLineaResponseDto[];
  @ApiPropertyOptional({ type: [RequerimientoEventoResponseDto] }) eventos?: RequerimientoEventoResponseDto[];
  @ApiPropertyOptional({ type: [RequerimientoOrdenCompraResponseDto] }) ordenes_compra?: RequerimientoOrdenCompraResponseDto[];
}
