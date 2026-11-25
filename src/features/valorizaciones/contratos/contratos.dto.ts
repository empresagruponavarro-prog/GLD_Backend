import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { SinMayusculasCampo } from '../../../platform/http/sin-mayusculas.decorator.js';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const ESTADOS_CONTRATO = ['BORRADOR', 'VIGENTE', 'LIQUIDADO', 'ANULADO'] as const;

export class ListContratosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ESTADOS_CONTRATO }) @IsOptional() @IsIn(ESTADOS_CONTRATO)
  estado?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional({ description: 'Proveedor (anexo)' }) @IsOptional() @Type(() => Number) @IsInt()
  id_anexo?: number;
}

export class CreateContratoDto {
  @ApiProperty({ description: 'Orden de servicio registrada a la que se le crea el contrato' })
  @IsInt() @Min(1)
  id_documento_origen: number;
}

/** Cambios de un contrato. Lo económico (adelanto, garantía, cantidad de valorizaciones, meses) borra los vistos. */
export class UpdateContratoDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100)
  adelanto_porcentaje?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100)
  garantia_porcentaje?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, description: 'Valorizaciones del contrato; la última es la liquidación' })
  @IsOptional() @IsInt() @Min(1) @Max(12)
  numero_valorizaciones?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 36 }) @IsOptional() @IsInt() @Min(0) @Max(36)
  meses_garantia?: number;

  @ApiPropertyOptional({ description: 'Fecha de la primera valorización (luego, una por semana)' }) @IsOptional() @Matches(FECHA_REGEX)
  fecha_primera?: string;

  @ApiPropertyOptional({ description: 'Anexo (trabajador) que supervisa y propone los montos' }) @IsOptional() @IsInt() @Min(1)
  id_supervisor?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @SinMayusculasCampo()
  alcances?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @SinMayusculasCampo()
  condiciones_generales?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @SinMayusculasCampo()
  condiciones_comerciales?: string;
}

export class DevolverGarantiaDto {
  @ApiPropertyOptional({ description: 'Obligatorio si todavía no venció el plazo de la garantía' }) @IsOptional() @IsString() @MaxLength(500)
  motivo?: string;
}
