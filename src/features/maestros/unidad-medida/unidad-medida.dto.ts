import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUnidadMedidaDto {
  @ApiProperty({ example: 'CIEN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  codigo: string;

  @ApiProperty({ example: 'CIENTO' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  descripcion: string;

  @ApiProperty({ required: false, example: '100' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  simbolo?: string;
}

export class UpdateUnidadMedidaDto extends PartialType(CreateUnidadMedidaDto) {}

export type UnidadMedidaRow = {
  id: number;
  codigo: string;
  descripcion: string;
  simbolo: string | null;
};