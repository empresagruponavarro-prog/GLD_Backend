import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUbicacionDto {
  @ApiPropertyOptional({
    description: 'Código único de la ubicación. Si no se indica, se autogenera con local-nivel-ambiente',
    example: 'SEDE-LIM-P2-OF-TI',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigo?: string;

  @ApiProperty({ description: 'ID del local / sede', example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id_local!: number;

  @ApiProperty({ description: 'ID del nivel / piso', example: 2 })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id_nivel!: number;

  @ApiProperty({ description: 'ID del ambiente', example: 3 })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id_ambiente!: number;

  @ApiPropertyOptional({ description: 'ID del área asignada (opcional)', example: 4, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_area?: number | null;

  @ApiPropertyOptional({ description: 'Observaciones o notas adicionales', example: 'Frente al ascensor', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  observaciones?: string | null;

  @ApiPropertyOptional({ description: 'Estado activo/inactivo', default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateUbicacionDto {
  @ApiPropertyOptional({ description: 'Código único de la ubicación' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigo?: string;

  @ApiPropertyOptional({ description: 'ID del local' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_local?: number;

  @ApiPropertyOptional({ description: 'ID del nivel' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_nivel?: number;

  @ApiPropertyOptional({ description: 'ID del ambiente' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_ambiente?: number;

  @ApiPropertyOptional({ description: 'ID del área', nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_area?: number | null;

  @ApiPropertyOptional({ description: 'Observaciones', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  observaciones?: string | null;

  @ApiPropertyOptional({ description: 'Estado activo/inactivo' })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class ResolverUbicacionQueryDto {
  @ApiProperty({ description: 'ID del local', example: 1 })
  @Type(() => Number)
  @IsInt()
  id_local!: number;

  @ApiProperty({ description: 'ID del nivel', example: 2 })
  @Type(() => Number)
  @IsInt()
  id_nivel!: number;

  @ApiProperty({ description: 'ID del ambiente', example: 3 })
  @Type(() => Number)
  @IsInt()
  id_ambiente!: number;
}

export class UbicacionResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  codigo!: string;

  @ApiProperty()
  id_local!: number;

  @ApiPropertyOptional()
  local_codigo?: string;

  @ApiPropertyOptional()
  local_nombre?: string;

  @ApiPropertyOptional({ enum: ['EMPRESA', 'CENTRO_COSTO'], description: 'El local pertenece a una Empresa O a un Centro de Costo' })
  local_tipo_asignacion?: 'EMPRESA' | 'CENTRO_COSTO';

  @ApiPropertyOptional({ nullable: true, description: 'Razón social de la Empresa o Centro de Costo al que pertenece el local' })
  local_asignado_a?: string | null;

  @ApiProperty()
  id_nivel!: number;

  @ApiPropertyOptional()
  nivel_codigo?: string;

  @ApiPropertyOptional()
  nivel_descripcion?: string;

  @ApiProperty()
  id_ambiente!: number;

  @ApiPropertyOptional()
  ambiente_codigo?: string;

  @ApiPropertyOptional()
  ambiente_descripcion?: string;

  @ApiPropertyOptional({ nullable: true })
  id_area!: number | null;

  @ApiPropertyOptional({ nullable: true })
  area_codigo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  area_nombre?: string | null;

  @ApiPropertyOptional({ nullable: true })
  observaciones!: string | null;

  @ApiProperty()
  estado!: boolean;
}
