import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class PeriodoFiscalDto {
  @ApiProperty({ example: 2027 }) anio: number;
  @ApiProperty() activo: boolean;
}

export class SetPeriodoFiscalDto {
  @ApiProperty({ description: 'Activo = se puede elegir como periodo de un centro de costo o presupuesto' })
  @IsBoolean()
  activo: boolean;
}
