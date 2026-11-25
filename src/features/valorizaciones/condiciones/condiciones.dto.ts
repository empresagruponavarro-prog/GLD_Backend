import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { SinMayusculasCampo } from '../../../platform/http/sin-mayusculas.decorator.js';

/** Condiciones por defecto de los contratistas según el tipo de servicio (categoría del producto); sin categoría = las generales. */
export class CreateCondicionDto {
  @ApiPropertyOptional({ description: '`categoria.id`; sin valor = condiciones generales (solo puede haber una)' }) @IsOptional() @IsInt() @Min(1)
  id_categoria?: number;

  @ApiProperty({ minimum: 0, maximum: 100 }) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100)
  adelanto_porcentaje: number;

  @ApiProperty({ minimum: 0, maximum: 100 }) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100)
  garantia_porcentaje: number;

  @ApiProperty({ minimum: 1, maximum: 12 }) @IsInt() @Min(1) @Max(12)
  numero_valorizaciones: number;

  @ApiProperty({ minimum: 0, maximum: 36 }) @IsInt() @Min(0) @Max(36)
  meses_garantia: number;

  @ApiPropertyOptional({ description: 'Descuento fijo (S/ con IGV) que se carga como deductivo al crear el contrato de una obra fuera de Lima Metropolitana (p. ej. instalación de puertas). 0 = no aplica' })
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000000)
  descuento_fuera_lima?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @SinMayusculasCampo()
  condiciones_generales?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @SinMayusculasCampo()
  condiciones_comerciales?: string;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  estado?: boolean;
}

export class UpdateCondicionDto extends PartialType(CreateCondicionDto) {}
