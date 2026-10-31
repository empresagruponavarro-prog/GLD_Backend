import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MOTIVOS_REPROGRAMACION } from '../shared/control-avance/control-avance.types.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class ObraReprogramacionDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: '2026-10-15' }) desde: string;
  @ApiProperty({ example: 7 }) dias: number;
  @ApiProperty({ enum: MOTIVOS_REPROGRAMACION }) motivo: string;
  @ApiPropertyOptional({ nullable: true }) detalle: string | null;
  /** `true` si es causa interna: cuenta como atraso y no corre el plan. */
  @ApiProperty() es_atraso: boolean;
  @ApiPropertyOptional({ nullable: true }) registrado_por: string | null;
}

export class CreateReprogramacionDto {
  @ApiProperty({ example: '2026-10-15', description: 'Día en que se detiene o corre el trabajo' })
  @Matches(FECHA, { message: 'desde debe ser YYYY-MM-DD' })
  desde: string;

  @ApiProperty({ example: 7, description: 'Días calendario que se amplía (1 a 60)' })
  @IsInt() @Min(1) @Max(60) @Type(() => Number)
  dias: number;

  @ApiProperty({ enum: MOTIVOS_REPROGRAMACION, description: 'INTERNO = es atraso; el resto es causa externa' })
  @IsIn(MOTIVOS_REPROGRAMACION)
  motivo: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) detalle?: string | null;
}

export class UpdateReprogramacionDto {
  @ApiPropertyOptional() @IsOptional() @Matches(FECHA, { message: 'desde debe ser YYYY-MM-DD' }) desde?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(60) @Type(() => Number) dias?: number;
  @ApiPropertyOptional({ enum: MOTIVOS_REPROGRAMACION }) @IsOptional() @IsIn(MOTIVOS_REPROGRAMACION) motivo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) detalle?: string | null;
}
