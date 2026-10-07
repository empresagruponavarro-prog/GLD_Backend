import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateFamiliaAlmacenDto {
  @ApiProperty({ example: 'CON', description: '3 letras mayúsculas; prefijo del código automático' })
  @Matches(/^[A-Z]{3}$/, { message: 'prefijo debe ser de 3 letras mayúsculas' })
  prefijo: string;

  @ApiProperty({ example: 'CONSUMIBLES' })
  @IsString()
  @MinLength(1)
  nombre: string;
}

export class UpdateFamiliaAlmacenDto {
  @ApiPropertyOptional({ example: 'CONSUMIBLES' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class FamiliaAlmacenResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'CON' }) prefijo: string;
  @ApiProperty({ example: 'CONSUMIBLES' }) nombre: string;
  @ApiProperty({ example: 12, description: 'Último correlativo asignado' }) ultimo_correlativo: number;
  @ApiProperty() estado: boolean;
}

export class FamiliaAlmacenSelectResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'CON - CONSUMIBLES' }) nombre: string;
  @ApiProperty({ example: 'CON' }) prefijo: string;
}
