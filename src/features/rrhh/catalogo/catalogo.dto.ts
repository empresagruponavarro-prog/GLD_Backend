import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Catálogos de RR.HH. que se mantienen desde esta pantalla (segmento de la URL). */
export const CATALOGOS = ['tipos-trabajador', 'modalidades-contrato'] as const;
export type Catalogo = (typeof CATALOGOS)[number];

export class CrearOpcionDto {
  @ApiProperty({ example: 'PLAZO FIJO (SUPLENCIA)', description: 'Se guarda en mayúsculas' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nombre: string;
}

export class ActualizarOpcionDto {
  @ApiPropertyOptional({ example: 'PLAZO FIJO (SUPLENCIA)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nombre?: string;

  @ApiPropertyOptional({ example: false, description: 'false = ya no se ofrece al elegir (quien la tenía la conserva)' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class MoverOpcionDto {
  @ApiProperty({ enum: ['arriba', 'abajo'] })
  @IsIn(['arriba', 'abajo'])
  direccion: 'arriba' | 'abajo';
}

export class OpcionResponseDto {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: 'PLAZO INDETERMINADO' }) nombre: string;
  @ApiProperty({ example: true }) activo: boolean;
  @ApiProperty({ example: 1 }) orden: number;
  @ApiProperty({ example: 12, description: 'Trabajadores que la tienen (si es mayor que 0 no se puede eliminar)' }) usos: number;
}
