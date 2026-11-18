import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { ConciliacionResponseDto } from '../compromisos/compromisos.dto.js';

// ─── Request ──────────────────────────────────────────────────────────────────

/** Un ítem de la partida (producto o servicio del catálogo). Sin `id` → se crea. */
export class UpsertPartidaItemDto {
  @ApiPropertyOptional({ example: 12, description: 'Id del ítem existente; si falta, se crea' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id?: number;

  @ApiProperty({ example: 345, description: 'Producto o servicio del catálogo' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id_producto: number;

  @ApiProperty({ example: 7 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id_unidad_medida: number;

  @ApiPropertyOptional({ example: 6, description: 'ID de la categoría CD asignada' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id_categoria?: number;

  @ApiPropertyOptional({ example: '2.01' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  Item?: string;

  @ApiProperty({ example: 12.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  Cantidad: number;

  @ApiProperty({ example: 35.4, description: 'Costo unitario (META)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  CostoUnitario: number;

  @ApiProperty({ example: 42, description: 'Precio de venta unitario (contrato)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  PrecioVenta: number;
}

/** Lote completo de ítems de una partida: lo que no venga se elimina. */
export class SyncPartidaItemsDto {
  @ApiProperty({ type: () => [UpsertPartidaItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertPartidaItemDto)
  items: UpsertPartidaItemDto[];
}

// ─── Response ─────────────────────────────────────────────────────────────────

export class PartidaItemProductoDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ enum: ['PRODUCTO', 'SERVICIO'] }) tipo_producto: 'PRODUCTO' | 'SERVICIO';
  @ApiProperty() id_categoria: number;
  @ApiPropertyOptional() categoria?: string;
}

export class PartidaItemUnidadDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiPropertyOptional() simbolo?: string;
}

export class PartidaItemCompromisoDto {
  @ApiProperty() id_requerimiento: number;
  @ApiProperty() numero_requerimiento: string;
  @ApiProperty() estado_requerimiento: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) id_documento: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) numero_documento: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'PROVISIONAL mientras el presupuesto no se aprueba; luego REGISTRADO' })
  estado_documento: string | null;
}

export class PartidaItemAdjudicadoDto {
  @ApiProperty() id_cotizacion: number;
  @ApiProperty({ description: '`ppto_cotizacion_detalle.id` de la oferta ganadora' }) id_cot_detalle: number;
  @ApiProperty() numero_cotizacion: string;
  @ApiProperty() id_proveedor: number;
  @ApiPropertyOptional({ nullable: true, type: String }) proveedor: string | null;
  @ApiProperty() moneda_id: string;
  @ApiPropertyOptional({ nullable: true, type: String }) moneda_simbolo: string | null;
  @ApiProperty({ description: 'Precio unitario sin IGV del ganador, en su moneda' }) precio_sin_igv: string;
  @ApiPropertyOptional({ nullable: true, type: String }) adjudicado_por: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) fecha_adjudicacion: string | null;
}

/** Solo en los ítems de un presupuesto (no en los de plantilla). */
export class PartidaItemCotizacionDto {
  @ApiProperty({ description: 'Cotizaciones de proveedores que ofrecen este ítem' }) cotizaciones: number;
  @ApiPropertyOptional({ type: () => PartidaItemAdjudicadoDto, nullable: true }) adjudicado: PartidaItemAdjudicadoDto | null;
  @ApiPropertyOptional({ type: () => PartidaItemCompromisoDto, nullable: true }) compromiso: PartidaItemCompromisoDto | null;
  @ApiProperty({ description: 'Ya tiene una orden registrada: no cambia de proveedor' }) cubierto: boolean;
}

export class PartidaItemResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() id_plantilla_categoria: number;
  @ApiPropertyOptional() Item?: string;
  @ApiProperty() Orden: number;
  @ApiProperty() id_producto: number;
  @ApiPropertyOptional({ type: () => PartidaItemProductoDto }) producto?: PartidaItemProductoDto;
  @ApiProperty() id_unidad_medida: number;
  @ApiPropertyOptional({ type: () => PartidaItemUnidadDto }) unidad?: PartidaItemUnidadDto;
  @ApiProperty() Cantidad: number;
  @ApiProperty() CostoUnitario: number;
  @ApiProperty() PrecioVenta: number;
  @ApiProperty() CostoTotal: number;
  @ApiProperty() VentaTotal: number;
  @ApiPropertyOptional({ type: () => PartidaItemCotizacionDto }) cotizacion?: PartidaItemCotizacionDto;
}

export class PartidaItemsResponseDto {
  @ApiProperty() id_plantilla_categoria: number;
  @ApiProperty({ type: () => [PartidaItemResponseDto] }) items: PartidaItemResponseDto[];
  @ApiProperty({ description: 'Suma de CostoTotal (= CostoReferencial de la partida)' }) costoTotal: number;
  @ApiProperty({ description: 'Suma de VentaTotal' }) ventaTotal: number;
  @ApiPropertyOptional({ type: () => ConciliacionResponseDto, description: 'Solo en el PUT de ítems de un presupuesto: lo que se actualizó en los compromisos' })
  compromisos?: ConciliacionResponseDto;
}
