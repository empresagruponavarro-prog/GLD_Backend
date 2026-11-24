import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class AvanceLineaDto {
  @ApiProperty({ description: '`ordenCompraDetalle.id`: la línea de la orden de servicio' }) @IsInt() @Min(1)
  id_orden_detalle: number;

  @ApiProperty({ minimum: 0, maximum: 100, description: 'Avance acumulado de la partida al corte (cuando la obra no lo informa)' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  avance_pct: number;
}

export class CrearCuotaDto {
  @ApiProperty({ example: '2026-11-22', description: 'Corte del avance (hasta hoy). Una por semana' }) @Matches(FECHA_REGEX)
  fecha_corte: string;

  @ApiPropertyOptional({ description: 'Monto bruto elegido por el supervisor. Sin él se propone el sugerido (el plan, limitado por el avance). Si difiere, hace falta `motivo_monto`' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  valorizado?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  motivo_monto?: string;

  @ApiPropertyOptional({ type: [AvanceLineaDto], description: 'Avance escrito a mano por partida' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AvanceLineaDto)
  lineas?: AvanceLineaDto[];

  @ApiPropertyOptional({ type: [Number], description: 'Deductivos que se descuentan. Sin valor: todos los pendientes; `[]`: ninguno' })
  @IsOptional() @IsArray() @IsInt({ each: true })
  deductivos?: number[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  factura_numero?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(FECHA_REGEX)
  factura_fecha?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  factura_url?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  observaciones?: string;
}

export class ActualizarCuotaDto extends PartialType(CrearCuotaDto) {}

export class AnularCuotaDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500)
  motivo: string;
}

export class SemanaQueryDto {
  @ApiPropertyOptional({ description: 'Cualquier fecha de la semana; por defecto, hoy' }) @IsOptional() @Matches(FECHA_REGEX)
  fecha?: string;
}
