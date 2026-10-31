import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';

export class LineaAvanceDto {
  @ApiProperty() @IsInt() @Type(() => Number) idSubpartida: number;
  @ApiProperty({ nullable: true, description: 'Lo avanzado SOLO en esa semana, de 0 a 100 (no el acumulado). null borra el dato.' })
  @IsOptional()
  avance: number | null;
}

export class GuardarAvanceSemanaDto {
  @ApiProperty({ type: [LineaAvanceDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => LineaAvanceDto)
  lineas: LineaAvanceDto[];
}

export class AvanceSubpartidaDto {
  @ApiProperty() id: number;
  @ApiProperty() item: string;
  @ApiProperty() partida_item: string;
  @ApiProperty() partida_nombre: string;
  @ApiProperty() nombre: string;
  @ApiProperty() fecha_inicio: string;
  @ApiProperty() fecha_fin: string;
  /** Meta efectiva de cada semana (1-10): la manual o el reparto automático. */
  @ApiProperty({ type: [Number] }) metas: number[];
  /** Avance de cada semana (1-16); null = sin reportar. */
  @ApiProperty({ type: [Number], nullable: true }) avance: (number | null)[];
  /** Real acumulado (0-100). */
  @ApiProperty() real_acumulado: number;
}

export class SemanaCalendarioDto {
  @ApiProperty() numero: number;
  @ApiProperty() desde: string;
  @ApiProperty() hasta: string;
  /** La semana aún no empieza: no admite avance. */
  @ApiProperty() futura: boolean;
  @ApiProperty() en_curso: boolean;
}

export class AvanceObraDto {
  @ApiProperty() hoy: string;
  @ApiProperty() inicio_semana_1: string;
  @ApiProperty() semana_en_curso: number;
  @ApiProperty({ type: [SemanaCalendarioDto] }) semanas: SemanaCalendarioDto[];
  @ApiProperty({ type: [AvanceSubpartidaDto] }) subpartidas: AvanceSubpartidaDto[];
}

export class ResultadoGuardarAvanceDto {
  @ApiProperty() semana: number;
  @ApiProperty() lineas: number;
  /** Real de la obra (0-100) antes y después; nulos si la obra aún no se puede evaluar. */
  @ApiProperty({ nullable: true }) real_antes: number | null;
  @ApiProperty({ nullable: true }) real_despues: number | null;
}
