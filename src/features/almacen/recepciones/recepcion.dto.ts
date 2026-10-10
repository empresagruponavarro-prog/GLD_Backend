import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { DECIMAL_REGEX, FECHA_REGEX } from '../documentos/documento.dto.js';

export class RecepcionLineaDto {
  @ApiProperty({ example: 123, description: 'Línea de la OC (ordenCompraDetalle.id) que se recibe' })
  @IsInt()
  @Min(1)
  id_orden_compra_detalle: number;

  @ApiProperty({ example: '4', description: 'Cantidad recibida > 0 y ≤ saldo por recibir' })
  @Matches(DECIMAL_REGEX, { message: 'cantidad debe ser un decimal positivo (hasta 4 decimales)' })
  cantidad: string;
}

export class CreateRecepcionDto {
  @ApiProperty({ example: 240 })
  @IsInt()
  @Min(1)
  id_orden_compra: number;

  @ApiProperty({ example: 1, description: 'Almacén que recibe' })
  @IsInt()
  @Min(1)
  id_almacen: number;

  @ApiProperty({ example: '2026-10-10' })
  @Matches(FECHA_REGEX, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha: string;

  @ApiPropertyOptional({ description: 'Anexo tipo Trabajador que recibe' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_recibido_por?: number;

  @ApiPropertyOptional({
    example: '3.75',
    description: 'Obligatorio si la OC no está en soles: el costo de almacén es precio × tipo de cambio',
  })
  @IsOptional()
  @Matches(DECIMAL_REGEX, { message: 'tipo_cambio debe ser un decimal positivo' })
  tipo_cambio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;

  @ApiProperty({ type: [RecepcionLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecepcionLineaDto)
  lineas: RecepcionLineaDto[];
}

export class RecepcionPendienteResponseDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional() id_oc: string | null;
  @ApiPropertyOptional() numero_oc: string | null;
  @ApiPropertyOptional() fecha_emision: string | null;
  @ApiPropertyOptional() proveedor: string | null;
  @ApiPropertyOptional() id_centro_costo: number | null;
  @ApiPropertyOptional() centro_costo: string | null;
  @ApiPropertyOptional({ example: 'FUR-000001' }) numero_requerimiento: string | null;
  @ApiPropertyOptional() moneda_simbolo: string | null;
  @ApiPropertyOptional() total: string | null;
  @ApiProperty({ example: 2, description: 'Líneas de producto con saldo por recibir' }) lineas_pendientes: number;
}

export class RecepcionLineaPendienteResponseDto {
  @ApiProperty() id_detalle: number;
  @ApiProperty() id_producto: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty({ example: '10' }) cantidad: string;
  @ApiProperty({ example: '4' }) recibida: string;
  @ApiProperty({ example: '6' }) saldo: string;
  @ApiPropertyOptional({ example: '22.5' }) precio: string | null;
}

export class RecepcionNoRecibibleResponseDto {
  @ApiProperty() id_detalle: number;
  @ApiProperty() descripcion: string;
  @ApiProperty({ example: 'Servicio: no ingresa a almacén' }) motivo: string;
}

export class RecepcionOrdenCompraResponseDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional() id_oc: string | null;
  @ApiPropertyOptional() numero_oc: string | null;
  @ApiPropertyOptional() fecha_emision: string | null;
  @ApiPropertyOptional() id_proveedor: number | null;
  @ApiPropertyOptional() proveedor: string | null;
  @ApiPropertyOptional() id_centro_costo: number | null;
  @ApiPropertyOptional() centro_costo: string | null;
  @ApiPropertyOptional() numero_requerimiento: string | null;
  @ApiPropertyOptional() moneda_simbolo: string | null;
  @ApiProperty({ description: 'false → la recepción exige tipo_cambio' }) es_soles: boolean;
  @ApiPropertyOptional() total: string | null;
  @ApiProperty({ type: [RecepcionLineaPendienteResponseDto] }) lineas: RecepcionLineaPendienteResponseDto[];
  @ApiProperty({ type: [RecepcionNoRecibibleResponseDto] }) no_recibibles: RecepcionNoRecibibleResponseDto[];
}
