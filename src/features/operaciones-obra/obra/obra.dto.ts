import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ObraSemanaDto } from '../cronograma/cronograma.dto.js';
import { ObraDocumentoDto } from '../documentos/documentos.dto.js';
import { ObraIncidenciaDto } from '../incidencias/incidencias.dto.js';
import { ObraPlanoDto } from '../planos/planos.dto.js';
import { ObraResidenteDto } from '../residentes/residentes.dto.js';
import type { EquipoObra } from '../shared/control-avance/equipo.js';

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

  // ── Ficha operativa (Dashboard de Operaciones) ──
  @ApiPropertyOptional({ example: 'OP-26-020', description: 'Código de obra único (= centro de costos del Excel)' }) codigo_obra?: string;
  @ApiPropertyOptional() tienda?: string;
  /** Nulo = la obra no participa del Dashboard. Se cambia con `POST …/estado`. */
  @ApiPropertyOptional({ enum: ['PROXIMO', 'EN_EJECUCION', 'POST_VENTA', 'CULMINADO', 'SUSPENDIDA', 'CANCELADA'] }) estado_obra?: string;
  @ApiPropertyOptional() comentario?: string;
  @ApiPropertyOptional({ description: 'Solo para obras sin partidas' }) avance_general?: number;
  @ApiPropertyOptional() fecha_cierre_postventa?: string;
  @ApiPropertyOptional() plazo_postventa_dias?: number;
  @ApiPropertyOptional() observaciones_postventa?: string;
  @ApiPropertyOptional() id_presupuesto_origen?: number;
  @ApiPropertyOptional({ description: 'Jefe, coordinador, residente y responsables de presupuesto y procura ({ id, nombre })' }) equipo?: EquipoObra;
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

  // ── Ficha operativa ──
  @ApiPropertyOptional({ example: 'OP-26-020', description: 'Único por obra; se guarda en mayúsculas' })
  @IsOptional() @IsString() @MaxLength(30) @Matches(/^[A-Za-z0-9._-]+$/, { message: 'codigo_obra solo admite letras, números, punto, guion y guion bajo' })
  codigo_obra?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) tienda?: string;
  @ApiPropertyOptional({ nullable: true, description: 'Anexo de tipo Trabajador' }) @IsOptional() @IsInt() @Type(() => Number) id_jefe_proyecto?: number | null;
  @ApiPropertyOptional({ nullable: true, description: 'Anexo de tipo Trabajador; null = sin coordinador' }) @IsOptional() @IsInt() @Type(() => Number) id_coordinador?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Type(() => Number) id_residente?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Type(() => Number) id_resp_presupuesto?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsInt() @Type(() => Number) id_resp_procura?: number | null;
  @ApiPropertyOptional({ nullable: true, description: '0 a 100; solo se usa si la obra no tiene partidas' }) @IsOptional() @Min(0) @Max(100) @Type(() => Number) avance_general?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) comentario?: string | null;
  @ApiPropertyOptional({ nullable: true, description: '1 a 365' }) @IsOptional() @IsInt() @Min(1) @Max(365) @Type(() => Number) plazo_postventa_dias?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) observaciones_postventa?: string | null;
  @ApiPropertyOptional({ example: '2026-09-23', description: 'Inicio de la obra (se guarda en el centro de costo)' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha_inicio debe ser YYYY-MM-DD' }) fecha_inicio?: string;
  @ApiPropertyOptional({ example: '2026-10-26', description: 'Fin programado original (se guarda en el centro de costo)' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha_fin_prog debe ser YYYY-MM-DD' }) fecha_fin_prog?: string;
}
