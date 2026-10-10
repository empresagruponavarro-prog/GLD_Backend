import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Matches, MinLength, ValidateNested } from 'class-validator';
import { DECIMAL_REGEX } from '../requerimiento/requerimiento.dto.js';

export class EnviarRequerimientoDto {
  @ApiPropertyOptional({ description: 'Anexo (Trabajador) que envía; por defecto el solicitante' })
  @IsOptional()
  @IsInt()
  id_anexo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comentario?: string;
}

export class ObservarRequerimientoDto {
  @ApiProperty({ description: 'Anexo (Trabajador) que observa' })
  @IsInt()
  id_aprobador: number;

  @ApiProperty({ example: 'Falta detallar la cantidad de cemento' })
  @IsString()
  @MinLength(1)
  comentario: string;
}

export class RechazarRequerimientoDto {
  @ApiProperty({ description: 'Anexo (Trabajador) que rechaza' })
  @IsInt()
  id_aprobador: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  comentario: string;
}

export class AprobarLineaDto {
  @ApiProperty({ description: 'requerimiento_detalle.id' })
  @IsInt()
  id_detalle: number;

  @ApiProperty({ example: '8', description: 'Cantidad aprobada (0 excluye la línea; no puede superar lo pedido)' })
  @Matches(DECIMAL_REGEX, { message: 'cantidad_aprobada debe ser un decimal no negativo' })
  cantidad_aprobada: string;
}

export class AprobarRequerimientoDto {
  @ApiProperty({ description: 'Anexo (Trabajador) que aprueba' })
  @IsInt()
  id_aprobador: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comentario?: string;

  @ApiPropertyOptional({
    type: [AprobarLineaDto],
    description: 'Cantidades aprobadas por línea; las no enviadas se aprueban completas',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AprobarLineaDto)
  lineas?: AprobarLineaDto[];
}

export class AnularRequerimientoDto {
  @ApiPropertyOptional({ description: 'Anexo (Trabajador) que anula' })
  @IsOptional()
  @IsInt()
  id_anexo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comentario?: string;
}
