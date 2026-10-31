import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ESTADOS_OBRA, type CurvaS, type PartidaResultado } from '../shared/control-avance/control-avance.types.js';
import type { CampoFaltante } from '../shared/control-avance/carga-obra.js';
import type { CatalogosPortafolio, ObraResumen } from '../shared/control-avance/resumen-portafolio.js';
import { TIPOS_EVENTO_OBRA } from '../shared/control-avance/registrar-evento.js';

const aBooleano = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);
const aNumeros = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean).map(Number) : value);
const aLista = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : value);

export class PortafolioQueryDto {
  @ApiPropertyOptional({ example: '2026-10-19', description: 'Fecha con la que se calcula (YYYY-MM-DD); por defecto hoy en Lima. Con esta fecha no se generan avisos.' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hoy debe ser YYYY-MM-DD' })
  hoy?: string;

  @ApiPropertyOptional({ description: 'Año de inicio. Sin él no se filtra por año.' })
  @IsOptional() @IsInt() @Min(2000) @Max(2100) @Type(() => Number)
  anio?: number;

  @ApiPropertyOptional({ default: true, description: 'Con `anio`, suma las obras vigentes que iniciaron en años anteriores' })
  @IsOptional() @Transform(aBooleano) @IsBoolean()
  vigentesAnteriores?: boolean;

  @ApiPropertyOptional({ description: 'Solo obras que no están culminadas ni canceladas' })
  @IsOptional() @Transform(aBooleano) @IsBoolean()
  soloVigentes?: boolean;

  @ApiPropertyOptional({ description: 'Id del anexo cliente' }) @IsOptional() @IsInt() @Type(() => Number) cliente?: number;
  @ApiPropertyOptional({ description: 'Id del anexo del jefe de proyecto' }) @IsOptional() @IsInt() @Type(() => Number) jefe?: number;
  @ApiPropertyOptional({ description: 'Id del anexo del coordinador' }) @IsOptional() @IsInt() @Type(() => Number) coordinador?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) departamento?: string;
  @ApiPropertyOptional({ enum: ESTADOS_OBRA, description: 'Estado efectivo (derivado de las fechas)' }) @IsOptional() @IsIn(ESTADOS_OBRA) estado?: string;
  @ApiPropertyOptional({ description: 'Busca en el nombre y el código, sin distinguir mayúsculas ni tildes' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class ObraSinEvaluarDto {
  @ApiProperty() id_centro_costo: number;
  @ApiProperty({ nullable: true }) codigo_obra: string | null;
  @ApiProperty({ nullable: true }) centro_costo: string | null;
  @ApiProperty({ isArray: true, enum: ['estado_obra', 'fecha_inicio', 'fecha_fin_prog'] }) faltantes: CampoFaltante[];
}

export class PortafolioDto {
  @ApiProperty() hoy: string;
  /** Obras evaluables del Dashboard, antes de filtrar. */
  @ApiProperty() total: number;
  @ApiProperty({ description: 'Una fila por obra (ver ObraResumen): identidad, equipo, estado, fechas, resultado del motor y mini Curva S', type: 'array', items: { type: 'object' } })
  obras: ObraResumen[];
  @ApiProperty({ type: [ObraSinEvaluarDto], description: 'Obras con estado pero sin fechas: no se pueden calcular' }) sin_evaluar: ObraSinEvaluarDto[];
}

export class ArbolesQueryDto {
  @ApiPropertyOptional({ example: '12,15,20', description: 'Ids de centro de costo separados por coma (máx. 100)' })
  @Transform(aNumeros) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true })
  ids: number[];

  @ApiPropertyOptional({ example: '2026-10-19' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hoy debe ser YYYY-MM-DD' }) hoy?: string;
}

export class ArbolObraDto {
  @ApiProperty() id_centro_costo: number;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) partidas: PartidaResultado[];
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true }) curvaS: CurvaS | null;
}

export class EventosPortafolioQueryDto {
  @ApiPropertyOptional({ default: 100, maximum: 200 }) @IsOptional() @IsInt() @Min(1) @Max(200) @Type(() => Number) limite?: number;
  @ApiPropertyOptional({ example: 'SITUACION,VENCIDO', description: 'Tipos separados por coma' })
  @IsOptional() @Transform(aLista) @IsArray() @IsIn(TIPOS_EVENTO_OBRA, { each: true })
  tipos?: string[];
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Solo eventos desde esa fecha (Lima)' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe ser YYYY-MM-DD' }) desde?: string;
}

export class EventoPortafolioDto {
  @ApiProperty() id: number;
  @ApiProperty() id_centro_costo: number;
  @ApiProperty({ nullable: true }) codigo_obra: string | null;
  @ApiProperty({ nullable: true }) centro_costo: string | null;
  @ApiProperty() tipo: string;
  @ApiProperty() titulo: string;
  @ApiProperty({ nullable: true }) detalle: string | null;
  @ApiProperty({ nullable: true }) valor_antes: string | null;
  @ApiProperty({ nullable: true }) valor_despues: string | null;
  @ApiProperty({ enum: ['info', 'good', 'warn', 'crit'] }) severidad: string;
  /** Nulo = lo generó el sistema al detectar el cambio (situación, plazo vencido). */
  @ApiProperty({ nullable: true }) usuario: string | null;
  @ApiProperty() created_at: string;
}

export class SincronizacionDto {
  @ApiProperty({ description: 'Eventos nuevos guardados' }) creados: number;
}

export type CatalogosPortafolioDto = CatalogosPortafolio;
