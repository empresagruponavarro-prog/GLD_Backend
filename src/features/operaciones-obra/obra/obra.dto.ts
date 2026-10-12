import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ObraSemanaDto } from '../cronograma/cronograma.dto.js';
import { ObraDocumentoDto } from '../documentos/documentos.dto.js';
import { ObraIncidenciaDto } from '../incidencias/incidencias.dto.js';
import { ObraPlanoDto } from '../planos/planos.dto.js';
import { ObraResidenteDto } from '../residentes/residentes.dto.js';

// ─── Datos generales de la Obra ────────────────────────────────────────────────
export class ObraDatosGeneralesDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional() expediente_codigo?: string;
  @ApiPropertyOptional() direccion?: string;
  @ApiPropertyOptional() departamento?: string;
  @ApiPropertyOptional() provincia?: string;
  @ApiPropertyOptional() distrito?: string;
  @ApiPropertyOptional() ubigeo_cod?: string;
  @ApiPropertyOptional() latitud?: number;
  @ApiPropertyOptional() longitud?: number;
  /** Enlace Google Maps generado al vuelo */
  @ApiPropertyOptional() google_maps_url?: string;
  /** Enlace Waze generado al vuelo */
  @ApiPropertyOptional() waze_url?: string;
  @ApiPropertyOptional() semanas_totales?: number;
  @ApiPropertyOptional() personal_activo_promedio?: number;
  @ApiPropertyOptional() turno_trabajo?: string;
  @ApiPropertyOptional() contacto_cliente_nombre?: string;
  @ApiPropertyOptional() contacto_cliente_telefono?: string;
  @ApiPropertyOptional() contacto_cliente_correo?: string;
}

// ─── Cabecera tomada del Centro de Costo (solo lectura) ───────────────────────
export class ObraCabeceraDto {
  @ApiPropertyOptional() estado?: string;
  @ApiPropertyOptional() fecha_inicio?: string;
  @ApiPropertyOptional() fecha_fin_prog?: string;
  @ApiPropertyOptional() fecha_fin_real?: string;
  @ApiPropertyOptional() empresa?: string;
  @ApiPropertyOptional() cliente?: string;
  @ApiPropertyOptional() cod_cliente?: string;
}

// ─── KPIs calculados ─────────────────────────────────────────────────────────
export class ObraKpiDto {
  /** % acumulado real reportado (última semana con avance) */
  @ApiProperty() avance_real_global: number;
  /** % acumulado programado a la fecha (semana en curso) */
  @ApiProperty() avance_meta_global: number;
  /** avance_real_global - avance_meta_global */
  @ApiProperty() desviacion: number;
  /** Semana en curso según fechas (0 si la obra no ha iniciado) */
  @ApiProperty() semana_activa: number;
  @ApiProperty() semanas_totales: number;
  @ApiProperty() personal_activo: number;
  @ApiProperty() dias_totales: number;
  @ApiProperty() dias_transcurridos: number;
  @ApiProperty() semanas_retrasadas: number;
  @ApiProperty() incidencias_pendientes: number;
}

// ─── Payload del Cockpit Completo ─────────────────────────────────────────────
export class ObraCockpitDto {
  @ApiProperty() id_centro_costo: number;
  @ApiProperty() nombre_obra: string;
  @ApiProperty({ type: ObraCabeceraDto }) cabecera: ObraCabeceraDto;
  @ApiPropertyOptional({ type: ObraDatosGeneralesDto }) generales?: ObraDatosGeneralesDto;
  @ApiProperty({ type: ObraKpiDto }) kpis: ObraKpiDto;
  @ApiProperty({ type: [ObraSemanaDto] }) cronograma: ObraSemanaDto[];
  @ApiProperty({ type: [ObraResidenteDto] }) residentes: ObraResidenteDto[];
  @ApiProperty({ type: [ObraPlanoDto] }) planos: ObraPlanoDto[];
  @ApiProperty({ type: [ObraDocumentoDto] }) documentos: ObraDocumentoDto[];
  @ApiProperty({ type: [ObraIncidenciaDto] }) incidencias: ObraIncidenciaDto[];
}

// ─── DTOs de Entrada ─────────────────────────────────────────────────────────
export class UpdateObraDatosGeneralesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) expediente_codigo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) direccion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) departamento?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) provincia?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) distrito?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) ubigeo_cod?: string;
  @ApiPropertyOptional() @IsOptional() @IsLatitude() @Type(() => Number) latitud?: number;
  @ApiPropertyOptional() @IsOptional() @IsLongitude() @Type(() => Number) longitud?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) semanas_totales?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Type(() => Number) personal_activo_promedio?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) turno_trabajo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) contacto_cliente_nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) contacto_cliente_telefono?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(150) contacto_cliente_correo?: string;
}
