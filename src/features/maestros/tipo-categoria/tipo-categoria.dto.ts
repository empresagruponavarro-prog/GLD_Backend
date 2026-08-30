import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTipoCategoriaDto {
  @ApiProperty({ example: 'COSTO_DIRECTO' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codigo: string;

  @ApiProperty({ example: 'COSTO DIRECTO, GASTO GENERAL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  nombre: string;
}

export class UpdateTipoCategoriaDto extends PartialType(CreateTipoCategoriaDto) {}

export type TipoCategoriaRow = {
  id: number;
  codigo: string;
  nombre: string;
};