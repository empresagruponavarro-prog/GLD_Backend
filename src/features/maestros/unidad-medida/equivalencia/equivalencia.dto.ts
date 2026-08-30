import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsPositive, IsString, Matches } from 'class-validator';

const DECIMAL = /^\d+(\.\d+)?$/;

export class CreateEquivalenciaDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @IsPositive()
  id_uni_med_destino: number;

  @ApiProperty({ example: '100' })
  @IsString()
  @IsNotEmpty()
  @Matches(DECIMAL, { message: 'factor_conversion debe ser un decimal válido' })
  factor_conversion: string;
}

export class UpdateEquivalenciaDto extends PartialType(CreateEquivalenciaDto) {}

export type EquivalenciaRow = {
  id: number;
  id_uni_med_origen: number;
  id_uni_med_destino: number;
  factor_conversion: string;
};