import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateAreaDto {
  @ApiProperty({ example: 'Sistemas' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre: string;

  @ApiPropertyOptional({ example: 'Soporte y desarrollo de sistemas' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Trabajador (anexo) que es jefe o gerente del área' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idJefe?: number;
}

export class UpdateAreaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Trabajador jefe o gerente; 0 o null lo quita' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  idJefe?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class AreaResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ description: 'Código correlativo asignado por el sistema (AR-01…)' }) codigo: string;
  @ApiProperty() nombre: string;
  @ApiProperty() estado: boolean;
  @ApiProperty({ nullable: true }) descripcion: string | null;
  @ApiProperty({ nullable: true }) idJefe: number | null;
  @ApiProperty({ nullable: true, description: 'Nombre del jefe o gerente' }) jefe: string | null;
}
