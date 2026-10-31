import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import type { EquipoObra } from '../shared/control-avance/equipo.js';
import type { CampoFaltante } from '../shared/control-avance/carga-obra.js';
import type { CurvaS, ResultadoObra } from '../shared/control-avance/control-avance.types.js';

export class FichaOperativaDto {
  @ApiPropertyOptional({ nullable: true }) codigo_obra: string | null;
  @ApiPropertyOptional({ nullable: true }) tienda: string | null;
  @ApiPropertyOptional({ nullable: true }) departamento: string | null;
  @ApiPropertyOptional({ nullable: true }) comentario: string | null;
  @ApiProperty({ description: 'jefe_proyecto, coordinador, residente, resp_presupuesto y resp_procura ({ id, nombre } o null)' })
  equipo: EquipoObra;
}

/** Control de avance de una obra: la ficha operativa y todo lo calculado por el motor. */
export class ControlObraDto {
  @ApiProperty() id_centro_costo: number;
  /** Fecha con la que se calculó (hoy en Lima, o la pedida con `?hoy=`). */
  @ApiProperty() hoy: string;
  /** `false` si falta estado, inicio o fin: entonces `resultado` es null. */
  @ApiProperty() configurada: boolean;
  @ApiProperty({ type: [String] }) faltantes: CampoFaltante[];
  @ApiProperty({ nullable: true }) estado_obra: string | null;
  @ApiProperty({ type: FichaOperativaDto }) ficha: FichaOperativaDto;
  @ApiProperty({ nullable: true, description: 'ResultadoObra del motor: programado, real, desviación, situación, plazos, post venta, árbol de partidas, Curva S y avisos' })
  resultado: ResultadoObra | null;
}

export class CurvaSQueryDto {
  @ApiPropertyOptional({ example: '2026-10-19' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hoy debe ser YYYY-MM-DD' })
  hoy?: string;

  @ApiPropertyOptional({ enum: ['todo', 'C', 'A'], description: 'Todo · solo Contractual · solo Adicionales' })
  @IsOptional() @IsIn(['todo', 'C', 'A'])
  tipo?: 'todo' | 'C' | 'A';
}

export class EventosQueryDto {
  @ApiPropertyOptional({ default: 50, maximum: 200 }) @IsOptional() @IsInt() @Min(1) @Max(200) @Type(() => Number)
  limite?: number;
}

export class ObraEventoDto {
  @ApiProperty() id: number;
  @ApiProperty() tipo: string;
  @ApiProperty() titulo: string;
  @ApiPropertyOptional({ nullable: true }) detalle: string | null;
  @ApiPropertyOptional({ nullable: true }) valor_antes: string | null;
  @ApiPropertyOptional({ nullable: true }) valor_despues: string | null;
  @ApiProperty({ enum: ['info', 'good', 'warn', 'crit'] }) severidad: string;
  @ApiPropertyOptional({ nullable: true }) usuario: string | null;
  @ApiProperty() created_at: string;
}

export type CurvaSDto = CurvaS | null;
