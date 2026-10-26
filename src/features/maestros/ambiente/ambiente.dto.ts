import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAmbienteDto {
  @ApiProperty({ description: 'Código del ambiente u oficina', example: 'AMB-01' })
  @IsString()
  @IsNotEmpty({ message: 'El código es obligatorio' })
  @MaxLength(20, { message: 'El código no puede superar 20 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  codigo!: string;

  @ApiProperty({ description: 'Descripción o nombre del ambiente', example: 'SALA DE REUNIONES A' })
  @IsString()
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @MaxLength(150, { message: 'La descripción no puede superar 150 caracteres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  descripcion!: string;

  @ApiPropertyOptional({ description: 'Estado del ambiente', default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateAmbienteDto {
  @ApiPropertyOptional({ description: 'Descripción o nombre del ambiente' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Estado del ambiente' })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class AmbienteResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'AMB-01' })
  codigo!: string;

  @ApiProperty({ example: 'SALA DE REUNIONES A' })
  descripcion!: string;

  @ApiProperty({ example: true })
  estado!: boolean;
}
