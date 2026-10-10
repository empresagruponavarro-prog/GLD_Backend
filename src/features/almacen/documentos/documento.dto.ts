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

export const NATURALEZAS = ['INGRESO', 'SALIDA', 'TRANSFERENCIA'] as const;
export type Naturaleza = (typeof NATURALEZAS)[number];

export const MOTIVOS_INGRESO = [
  'INVENTARIO_INICIAL',
  'COMPRA',
  'DEVOLUCION',
  'INGRESO_CLIENTE',
  'AJUSTE_POSITIVO',
] as const;
export const MOTIVOS_SALIDA = ['CONSUMO', 'VENTA', 'BAJA', 'AJUSTE_NEGATIVO'] as const;
export const MOTIVOS_TRANSFERENCIA = ['TRANSFERENCIA'] as const;
export const MOTIVOS_TODOS = [...MOTIVOS_INGRESO, ...MOTIVOS_SALIDA, ...MOTIVOS_TRANSFERENCIA] as const;

export const DECIMAL_REGEX = /^\d{1,12}(\.\d{1,4})?$/;
export const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class DocumentoLineaDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  id_producto: number;

  @ApiProperty({ example: '10', description: 'Cantidad > 0 como string decimal (hasta 4 decimales)' })
  @Matches(DECIMAL_REGEX, { message: 'cantidad debe ser un decimal positivo (hasta 4 decimales)' })
  cantidad: string;

  @ApiPropertyOptional({
    example: '22.50',
    description: 'Costo unitario. Obligatorio en INVENTARIO_INICIAL, COMPRA e INGRESO_CLIENTE',
  })
  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'costo_unitario debe ser un decimal no negativo' })
  costo_unitario?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class CreateDocumentoDto {
  @ApiProperty({ example: '2026-10-06', description: 'Fecha de negocio YYYY-MM-DD' })
  @Matches(FECHA_REGEX, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha: string;

  @ApiProperty({ enum: MOTIVOS_TODOS, example: 'COMPRA' })
  @IsIn(MOTIVOS_TODOS)
  motivo: (typeof MOTIVOS_TODOS)[number];

  @ApiProperty({ example: 1, description: 'Almacén de ingreso / origen de la salida o transferencia' })
  @IsInt()
  @Min(1)
  id_almacen: number;

  @ApiPropertyOptional({ example: 2, description: 'Solo TRANSFERENCIA: almacén destino' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_almacen_destino?: number;

  @ApiPropertyOptional({ example: 'F001-0023', description: 'Factura / guía / vale' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  documento_referencia?: string;

  @ApiPropertyOptional({ description: 'Anexo tipo Proveedor' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_proveedor?: number;

  @ApiPropertyOptional({ description: 'Centro de costos (cliente / proyecto). Vacío = stock general / consumo interno' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_centro_costo?: number;

  @ApiPropertyOptional({ description: 'Anexo tipo Trabajador' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_recibido_por?: number;

  @ApiPropertyOptional({ description: 'Anexo tipo Trabajador' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_solicitado_por?: number;

  @ApiPropertyOptional({ description: 'Anexo tipo Trabajador' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_entregado_a?: number;

  @ApiPropertyOptional({ example: 'Retoques' })
  @IsOptional()
  @IsString()
  motivo_trabajo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;

  @ApiProperty({ type: [DocumentoLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DocumentoLineaDto)
  lineas: DocumentoLineaDto[];
}

export class ListDocumentoQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(FECHA_REGEX)
  desde?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(FECHA_REGEX)
  hasta?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_almacen?: number;

  @ApiPropertyOptional({ enum: MOTIVOS_TODOS })
  @IsOptional()
  @IsIn(MOTIVOS_TODOS)
  motivo?: (typeof MOTIVOS_TODOS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_proveedor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional({ enum: ['REGISTRADO', 'ANULADO'] })
  @IsOptional()
  @IsIn(['REGISTRADO', 'ANULADO'])
  estado?: 'REGISTRADO' | 'ANULADO';
}

export class DocumentoLineaResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() id_producto: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty({ example: '10' }) cantidad: string;
  @ApiPropertyOptional({ example: '22.5' }) costo_unitario: string | null;
  @ApiPropertyOptional() observaciones: string | null;
  @ApiPropertyOptional({ description: 'Línea de OC de origen (recepciones)' }) id_orden_compra_detalle: number | null;
}

export class DocumentoResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'ING-000001' }) numero: string;
  @ApiProperty({ enum: NATURALEZAS }) naturaleza: Naturaleza;
  @ApiProperty({ enum: MOTIVOS_TODOS }) motivo: string;
  @ApiProperty({ example: '2026-10-06' }) fecha: string;
  @ApiProperty() id_almacen: number;
  @ApiProperty() almacen: string;
  @ApiPropertyOptional() id_almacen_destino: number | null;
  @ApiPropertyOptional() almacen_destino: string | null;
  @ApiPropertyOptional() documento_referencia: string | null;
  @ApiPropertyOptional() id_proveedor: number | null;
  @ApiPropertyOptional() proveedor: string | null;
  @ApiPropertyOptional() id_centro_costo: number | null;
  @ApiPropertyOptional() centro_costo: string | null;
  @ApiPropertyOptional() id_recibido_por: number | null;
  @ApiPropertyOptional() recibido_por: string | null;
  @ApiPropertyOptional() id_solicitado_por: number | null;
  @ApiPropertyOptional() solicitado_por: string | null;
  @ApiPropertyOptional() id_entregado_a: number | null;
  @ApiPropertyOptional() entregado_a: string | null;
  @ApiPropertyOptional() motivo_trabajo: string | null;
  @ApiPropertyOptional() observaciones: string | null;
  @ApiProperty({ enum: ['REGISTRADO', 'ANULADO'] }) estado: string;
  @ApiPropertyOptional() id_documento_anula: number | null;
  @ApiPropertyOptional({ description: 'Orden de compra de origen (recepciones)' }) id_orden_compra: number | null;
  @ApiPropertyOptional() numero_oc: string | null;
  @ApiProperty() created_at: string;
  @ApiProperty({ example: 3 }) total_lineas: number;
  @ApiPropertyOptional({ type: [DocumentoLineaResponseDto] }) lineas?: DocumentoLineaResponseDto[];
}
