import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SubfasesQueryDto {
  @ApiProperty({ example: 197, description: 'Centro de costo (obra)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_centro_costo: number;
}

export class SubfaseDto {
  @ApiProperty({ description: 'ppto_DetalleFasesCate.id' }) id: number;
  @ApiProperty({ example: 'MATERIALES' }) subfase: string;
  @ApiProperty({ example: 'OBRA GRUESA' }) fase: string;
  @ApiProperty({ example: 'PPTO-2026-001' }) presupuesto: string;
}

export class SubfasesCentroCostoDto {
  @ApiProperty() id_centro_costo: number;
  @ApiProperty({ description: 'El centro de costo tiene un presupuesto Principal aprobado: imputar a una subfase es obligatorio en las salidas CONSUMO' })
  requerida: boolean;
  @ApiProperty({ type: SubfaseDto, isArray: true }) subfases: SubfaseDto[];
}
