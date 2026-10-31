import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export const TIPOS_PARTIDA = ['CONTRACTUAL', 'ADICIONAL'] as const;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// ─── Salidas ─────────────────────────────────────────────────────────────────
export class ObraSubpartidaDto {
  @ApiProperty() id: number;
  @ApiProperty() id_partida: number;
  @ApiProperty() item: string;
  @ApiProperty() nombre: string;
  /** Tipo efectivo: el propio o, si no tiene, el de su partida. */
  @ApiProperty({ enum: TIPOS_PARTIDA }) tipo: string;
  /** Tipo escrito en la subpartida; nulo = hereda el de su partida. */
  @ApiPropertyOptional({ enum: TIPOS_PARTIDA, nullable: true }) tipo_propio: string | null;
  @ApiProperty({ example: '2026-09-23' }) fecha_inicio: string;
  @ApiProperty({ example: '2026-09-24' }) fecha_fin: string;
  @ApiProperty() orden: number;
  @ApiPropertyOptional({ nullable: true }) observacion: string | null;
  @ApiPropertyOptional({ nullable: true }) id_ppto_detalle_categoria: number | null;
  /** Metas escritas a mano por semana (1-10); `null` = usa el reparto automático. */
  @ApiProperty({ type: [Number], description: 'Diez posiciones; null = automática' }) metas_manuales: (number | null)[];
  @ApiProperty() tiene_avance: boolean;
}

export class ObraPartidaDto {
  @ApiProperty() id: number;
  @ApiProperty() item: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ enum: TIPOS_PARTIDA }) tipo: string;
  @ApiProperty() orden: number;
  @ApiPropertyOptional({ nullable: true }) id_ppto_detalle_fase: number | null;
  @ApiProperty({ type: [ObraSubpartidaDto] }) subpartidas: ObraSubpartidaDto[];
}

// ─── Entradas ────────────────────────────────────────────────────────────────
export class CreatePartidaDto {
  @ApiProperty({ example: '03', description: 'Ítem único por obra (máx. 20)' }) @IsString() @IsNotEmpty() @MaxLength(20) item: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(150) nombre: string;
  @ApiPropertyOptional({ enum: TIPOS_PARTIDA }) @IsOptional() @IsIn(TIPOS_PARTIDA) tipo?: string;
}

export class UpdatePartidaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) item?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) nombre?: string;
  @ApiPropertyOptional({ enum: TIPOS_PARTIDA }) @IsOptional() @IsIn(TIPOS_PARTIDA) tipo?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) orden?: number;
}

export class CreateSubpartidaDto {
  @ApiProperty({ example: '03.01' }) @IsString() @IsNotEmpty() @MaxLength(20) item: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(150) nombre: string;
  @ApiPropertyOptional({ enum: TIPOS_PARTIDA, nullable: true, description: 'Nulo/omitido = hereda el de la partida' })
  @IsOptional() @IsIn(TIPOS_PARTIDA) tipo?: string | null;
  @ApiProperty({ example: '2026-09-23' }) @Matches(FECHA, { message: 'fecha_inicio debe ser YYYY-MM-DD' }) fecha_inicio: string;
  @ApiProperty({ example: '2026-09-24' }) @Matches(FECHA, { message: 'fecha_fin debe ser YYYY-MM-DD' }) fecha_fin: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) observacion?: string | null;
}

export class UpdateSubpartidaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) item?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) nombre?: string;
  @ApiPropertyOptional({ enum: TIPOS_PARTIDA, nullable: true }) @IsOptional() @IsIn(TIPOS_PARTIDA) tipo?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(FECHA, { message: 'fecha_inicio debe ser YYYY-MM-DD' }) fecha_inicio?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(FECHA, { message: 'fecha_fin debe ser YYYY-MM-DD' }) fecha_fin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) observacion?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) orden?: number;
  /** Mover la subpartida a otra partida de la misma obra. */
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) id_partida?: number;
}

export class UpdateMetasDto {
  @ApiProperty({ type: [Number], description: 'Hasta 10 posiciones (semanas 1-10); null o ausente = reparto automático; 0-100 cada una' })
  @IsArray() metas: (number | null)[];
}

export class ImportarPresupuestoDto {
  @ApiProperty({ description: 'Id (numérico) del presupuesto de esta obra a importar' }) @IsInt() @Type(() => Number) idPresupuesto: number;
  @ApiPropertyOptional({ description: 'Reemplaza la estructura actual (solo si no tiene avance registrado)' }) @IsOptional() @IsBoolean() reemplazar?: boolean;
}
