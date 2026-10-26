import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';

export class CaracteristicaItemDto {
  @ApiProperty({ example: 'Procesador' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre!: string;

  @ApiProperty({ example: 'Intel Core i5' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  valor!: string;
}

export class ReplaceCaracteristicasDto {
  @ApiProperty({ type: [CaracteristicaItemDto], description: 'Reemplaza la lista completa (máx. 30)' })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CaracteristicaItemDto)
  caracteristicas!: CaracteristicaItemDto[];
}
