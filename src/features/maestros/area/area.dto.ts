import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAreaDto {
  @ApiProperty({ example: 'SISTEMAS' })
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'codigo: 2 a 20 caracteres en mayusculas, numeros, guion o guion bajo' })
  codigo: string;

  @ApiProperty({ example: 'Sistemas' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre: string;
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
  @IsBoolean()
  estado?: boolean;
}

export class AreaResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
  @ApiProperty() estado: boolean;
}
