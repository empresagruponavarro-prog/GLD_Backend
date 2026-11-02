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

  @ApiPropertyOptional({ description: 'Área de la que depende (su jefe superior es el jefe de esa área); sin valor = área superior' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idAreaPadre?: number;

  @ApiPropertyOptional({ description: 'Activa por defecto', default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
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

  @ApiPropertyOptional({ description: 'Área de la que depende; 0 o null la deja como área superior' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  idAreaPadre?: number | null;

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
  @ApiProperty({ nullable: true, description: 'Área de la que depende (null = área superior)' }) idAreaPadre: number | null;
  @ApiProperty({ nullable: true, description: 'Nombre del área de la que depende' }) areaPadre: string | null;
  @ApiProperty({ nullable: true, description: 'Jefe superior: el jefe del área de la que depende' }) jefeSuperior: string | null;
}
