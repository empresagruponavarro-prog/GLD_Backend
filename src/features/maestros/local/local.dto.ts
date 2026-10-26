import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLocalDto {
  @ApiPropertyOptional({
    description: 'Código único del local/sede. Obligatorio para sedes de empresa; para centro de costo se deriva automáticamente',
    example: 'SEDE-LIM',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'El código no puede superar 20 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  codigo?: string;

  @ApiPropertyOptional({
    description: 'Nombre del local o sede. Obligatorio para sedes de empresa; para centro de costo se deriva automáticamente',
    example: 'SEDE CENTRAL LIMA',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombre?: string;

  @ApiPropertyOptional({ description: 'Dirección física del local', example: 'Av. Javier Prado Este 1234' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  direccion?: string;

  @ApiPropertyOptional({ description: 'ID de la empresa asociada (excluyente con centro de costo)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_empresa?: number;

  @ApiPropertyOptional({ description: 'ID del centro de costo asociado (excluyente con empresa)', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional({ description: 'Estado del local', default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateLocalDto {
  @ApiPropertyOptional({ description: 'Nombre del local o sede', example: 'SEDE CENTRAL LIMA REF' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  nombre?: string;

  @ApiPropertyOptional({ description: 'Dirección física del local' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  direccion?: string;

  @ApiPropertyOptional({ description: 'ID de la empresa asociada' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_empresa?: number;

  @ApiPropertyOptional({ description: 'ID del centro de costo asociado' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional({ description: 'Estado del local' })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class LocalResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'SEDE-LIM' })
  codigo!: string;

  @ApiProperty({ example: 'SEDE CENTRAL LIMA' })
  nombre!: string;

  @ApiPropertyOptional({ example: 'Av. Javier Prado Este 1234' })
  direccion!: string | null;

  @ApiPropertyOptional({ example: 1 })
  id_empresa!: number | null;

  @ApiPropertyOptional({ example: 'GLD CONSTRUCTORA S.A.C.' })
  empresa_nombre!: string | null;

  @ApiPropertyOptional({ example: 2 })
  id_centro_costo!: number | null;

  @ApiPropertyOptional({ example: '02' })
  centro_costo_codigo!: string | null;

  @ApiPropertyOptional({ example: 'OBRA LOS OLIVOS' })
  centro_costo_nombre!: string | null;

  @ApiProperty({ enum: ['EMPRESA', 'CENTRO_COSTO'], example: 'EMPRESA' })
  tipo_asignacion!: 'EMPRESA' | 'CENTRO_COSTO';

  @ApiProperty({ example: true })
  estado!: boolean;
}
