import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateCategoriaDto {
  @ApiProperty({ example: 'MAT' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codigo: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  id_tipo_categoria: number;

  @ApiProperty({ required: false, example: 'Materiales' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}

export class UpdateCategoriaDto extends PartialType(CreateCategoriaDto) {}

export type CategoriaRow = {
  id: number;
  codigo: string;
  id_tipo_categoria: number;
  descripcion: string | null;
  estado: boolean;
};