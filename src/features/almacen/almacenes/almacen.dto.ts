import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export class CreateAlmacenDto {
  @ApiProperty({ example: 'ALM-GENERAL', description: 'Código único (máx. 20)' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  codigo: string;

  @ApiProperty({ example: 'Almacén General' })
  @IsString()
  @MinLength(1)
  nombre: string;

  @ApiPropertyOptional({ example: 1, description: 'Empresa a la que pertenece' })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_empresa?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateAlmacenDto extends PartialType(CreateAlmacenDto) {}

export class ListAlmacenQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  estado?: boolean;
}

export class AlmacenResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
  @ApiPropertyOptional() id_empresa: number | null;
  @ApiProperty() estado: boolean;
}

export class AlmacenSelectResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() nombre: string;
}

export class AlmacenSelectQueryDto {
  @ApiPropertyOptional({ description: 'false = incluye inactivos (default: solo activos)' })
  @IsOptional()
  @IsString()
  soloActivos?: string;
}
