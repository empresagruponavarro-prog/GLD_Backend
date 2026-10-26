import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNivelDto {
  @ApiProperty({ description: 'Código del nivel o piso', example: 'PISO-01' })
  @IsString()
  @IsNotEmpty({ message: 'El código es obligatorio' })
  @MaxLength(20, { message: 'El código no puede superar 20 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  codigo!: string;

  @ApiProperty({ description: 'Descripción o nombre del nivel', example: 'PRIMER PISO' })
  @IsString()
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @MaxLength(150, { message: 'La descripción no puede superar 150 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  descripcion!: string;

  @ApiPropertyOptional({ description: 'Estado del nivel', default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateNivelDto {
  @ApiPropertyOptional({ description: 'Descripción o nombre del nivel' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Estado del nivel' })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class NivelResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'PISO-01' })
  codigo!: string;

  @ApiProperty({ example: 'PRIMER PISO' })
  descripcion!: string;

  @ApiProperty({ example: true })
  estado!: boolean;
}
