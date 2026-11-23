import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsPositive, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { PORCENTAJE_MAXIMO, PORCENTAJE_MINIMO, PU_META_MINIMO } from '../shared/costos-meta.js';

// ─── Request ──────────────────────────────────────────────────────────────────

/** Precio Meta de un ítem de la subfase. `null` = el ítem vuelve a valer su Base. */
export class ItemMetaDto {
  @ApiProperty({ example: 501, description: 'Ítem de la subfase (`ppto_DetalleItems.id`)' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id: number;

  @ApiProperty({ example: 315, nullable: true, type: Number, description: `Precio unitario Meta (mínimo ${PU_META_MINIMO}); null = igual al Base` })
  @ValidateIf((o: ItemMetaDto) => o.CostoUnitarioMeta !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(PU_META_MINIMO)
  CostoUnitarioMeta: number | null;
}

/** Precios Meta de ítems de una subfase. Los ítems que no vienen **no cambian** (no se borra nada). */
export class SyncItemsMetaDto {
  @ApiProperty({ type: () => [ItemMetaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemMetaDto)
  items: ItemMetaDto[];
}

export class AjusteMetaDto {
  @ApiProperty({ example: 50, description: `% sobre el precio Base de cada ítem (50 = +50 %, -10 = -10 %); de ${PORCENTAJE_MINIMO} a ${PORCENTAJE_MAXIMO}` })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(PORCENTAJE_MINIMO)
  @Max(PORCENTAJE_MAXIMO)
  porcentaje: number;
}

/** Monto Meta escrito a mano de una subfase **sin ítems**. */
export class MetaSubfaseDto {
  @ApiProperty({ example: 900, nullable: true, type: Number, description: 'Monto Meta de la subfase; null = igual al Base' })
  @ValidateIf((o: MetaSubfaseDto) => o.CostoDirectoMeta !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  CostoDirectoMeta: number | null;
}

// ─── Response ─────────────────────────────────────────────────────────────────

export class MetaItemDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional({ nullable: true, type: String, example: '1.01' }) numero: string | null;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ example: 'M3' }) unidad: string;
  @ApiProperty({ example: '12.50' }) cantidad: string;
  @ApiProperty({ example: '350.00', description: 'Precio unitario Base' }) pu_base: string;
  @ApiProperty({ example: '315.00', description: 'Precio unitario Meta efectivo (el propio o, si no tiene, el Base)' }) pu_meta: string;
  @ApiProperty({ description: 'El ítem tiene un precio Meta propio (false = vale lo mismo que el Base)' }) pu_meta_propio: boolean;
  @ApiProperty({ example: '4375.00' }) total_base: string;
  @ApiProperty({ example: '3937.50' }) total_meta: string;
}

export class MetaSubfaseNodoDto {
  @ApiProperty({ description: '`ppto_DetalleFasesCate.id`' }) id: number;
  @ApiProperty() nombre: string;
  @ApiProperty({ example: '4375.00' }) base: string;
  @ApiProperty({ example: '3937.50', description: 'Con ítems, la suma de su Meta; sin ítems, su monto Meta a mano o, si no tiene, su Base' }) meta: string;
  @ApiProperty({ description: 'La subfase no tiene ítems y su Meta es un monto escrito a mano' }) meta_manual: boolean;
  @ApiProperty({ description: 'Cotizaciones de proveedores registradas en la subfase' }) cotizaciones: number;
  @ApiProperty({ type: () => [MetaItemDto] }) items: MetaItemDto[];
}

export class MetaFaseDto {
  @ApiProperty({ description: '`ppto_DetalleFases.id`' }) id: number;
  @ApiProperty() nombre: string;
  @ApiProperty({ example: '120000.00' }) base: string;
  @ApiProperty({ example: '104500.00' }) meta: string;
  @ApiProperty({ type: () => [MetaSubfaseNodoDto] }) subfases: MetaSubfaseNodoDto[];
}

export class MetaTotalesDto {
  @ApiProperty({ example: '120000.00' }) base: string;
  @ApiProperty({ example: '104500.00' }) meta: string;
  @ApiProperty({ example: '-15500.00', description: 'Meta − Base (negativa = el Meta es más barato)' }) diferencia: string;
  @ApiPropertyOptional({ nullable: true, type: String, example: '-12.92', description: '% del Meta sobre el Base; null si el Base es 0' }) diferencia_pct: string | null;
}

export class PresupuestoMetaResponseDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional({ nullable: true, type: String, example: 'PPTO-2026-014' }) id_presupuesto: string | null;
  @ApiProperty({ example: 'EN_DESARROLLO' }) estado_ppto: string;
  @ApiProperty({ description: 'El Meta se puede editar (el presupuesto está en desarrollo, en revisión u observado)' }) editable: boolean;
  @ApiProperty({ type: () => MetaTotalesDto }) totales: MetaTotalesDto;
  @ApiProperty({ type: () => [MetaFaseDto] }) fases: MetaFaseDto[];
}
