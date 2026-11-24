import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const MOTIVOS_DEDUCTIVO = ['MATERIAL', 'INCIDENCIA', 'PENALIDAD', 'INCUMPLIMIENTO', 'APOYO', 'ADICIONAL', 'OTRO'] as const;

/**
 * Descuento extraordinario al contratista (plan 12, R-14). `MATERIAL`: línea de una PECOSA y cantidad (el monto sale del costo de la salida).
 * `INCIDENCIA`: ligado a una incidencia de la obra. Los demás llevan el monto. Quedan pendientes hasta que una valorización los aplica.
 */
export class CreateDeductivoDto {
  @ApiProperty({ enum: MOTIVOS_DEDUCTIVO }) @IsIn(MOTIVOS_DEDUCTIVO)
  motivo: string;

  @ApiProperty({ example: '2026-11-22' }) @Matches(FECHA_REGEX)
  fecha: string;

  @ApiProperty({ maxLength: 300 }) @IsString() @MinLength(3) @MaxLength(300)
  descripcion: string;

  @ApiPropertyOptional({ description: 'Obligatorio salvo en MATERIAL (que lo calcula)' }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  monto?: number;

  @ApiPropertyOptional({ description: 'MATERIAL: `almacen_documento_detalle.id` de una salida de consumo de la misma obra' }) @IsOptional() @IsInt() @Min(1)
  id_almacen_detalle?: number;

  @ApiPropertyOptional({ description: 'MATERIAL: cantidad que se cobra (no puede pasar de lo entregado y aún no cobrado)' }) @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001)
  cantidad?: number;

  @ApiPropertyOptional({ description: 'INCIDENCIA: incidencia de la obra' }) @IsOptional() @IsInt() @Min(1)
  id_obra_incidencia?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  sustento_url?: string;
}

export class AnularDeductivoDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500)
  motivo: string;
}
