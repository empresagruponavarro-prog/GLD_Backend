import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// ─── Respuestas de Residentes ─────────────────────────────────────────────────
export class ObraResidenteDto {
  @ApiProperty() id: number;
  @ApiProperty() nombre_completo: string;
  @ApiProperty() rol_obra: string;
  @ApiPropertyOptional() cip_cap?: string;
  @ApiPropertyOptional() especialidad?: string;
  @ApiPropertyOptional() telefono?: string;
  @ApiPropertyOptional() correo?: string;
  @ApiPropertyOptional() turno?: string;
  @ApiProperty() estado_planta: string;
  @ApiPropertyOptional() foto_url?: string;
  /** Enlace directo WhatsApp generado al vuelo */
  @ApiPropertyOptional() whatsapp_url?: string;
}

// ─── Respuestas del Cronograma Semanal ────────────────────────────────────────
export class ObraSemanaDto {
  @ApiProperty() id: number;
  @ApiProperty() numero_semana: number;
  @ApiProperty() etiqueta_semana: string;
  @ApiProperty() fecha_inicio: string;
  @ApiProperty() fecha_fin: string;
  @ApiProperty() fase_principal: string;
  @ApiPropertyOptional() responsable_nombre?: string;
  @ApiProperty() porcentaje_meta: number;
  @ApiProperty() porcentaje_real: number;
  @ApiProperty() estado: string;
}

// ─── Respuestas de Planos ─────────────────────────────────────────────────────
export class ObraPlanoDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo_plano: string;
  @ApiProperty() nombre_plano: string;
  @ApiProperty() disciplina: string;
  @ApiProperty() version: string;
  @ApiProperty() es_vigente: boolean;
  @ApiProperty() estado_aprobacion: string;
  @ApiPropertyOptional() formato_peso?: string;
  @ApiPropertyOptional() archivo_url?: string;
  @ApiPropertyOptional() emitido_por?: string;
}

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

// ─── KPIs calculados ─────────────────────────────────────────────────────────
export class ObraKpiDto {
  @ApiProperty() avance_real_global: number;     // % calculado desde semanas
  @ApiProperty() avance_meta_global: number;     // % planificado acumulado
  @ApiProperty() desviacion: number;             // avance_real_global - avance_meta_global
  @ApiProperty() semana_activa: number;          // semana con estado 'En Plazo' o 'Retrasado'
  @ApiProperty() semanas_totales: number;
  @ApiProperty() personal_activo: number;
}

// ─── Payload del Cockpit Completo ─────────────────────────────────────────────
export class ObraCockpitDto {
  @ApiProperty() id_centro_costo: number;
  @ApiProperty() nombre_obra: string;
  @ApiPropertyOptional({ type: ObraDatosGeneralesDto }) generales?: ObraDatosGeneralesDto;
  @ApiProperty({ type: ObraKpiDto }) kpis: ObraKpiDto;
  @ApiProperty({ type: [ObraSemanaDto] }) cronograma: ObraSemanaDto[];
  @ApiProperty({ type: [ObraResidenteDto] }) residentes: ObraResidenteDto[];
  @ApiProperty({ type: [ObraPlanoDto] }) planos: ObraPlanoDto[];
}

// ─── DTOs de Entrada ─────────────────────────────────────────────────────────
export class UpdateObraDatosGeneralesDto {
  @IsOptional() @IsString() expediente_codigo?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() departamento?: string;
  @IsOptional() @IsString() provincia?: string;
  @IsOptional() @IsString() distrito?: string;
  @IsOptional() @IsString() ubigeo_cod?: string;
  @IsOptional() @IsNumber() @Type(() => Number) latitud?: number;
  @IsOptional() @IsNumber() @Type(() => Number) longitud?: number;
  @IsOptional() @IsInt() @Type(() => Number) semanas_totales?: number;
  @IsOptional() @IsInt() @Type(() => Number) personal_activo_promedio?: number;
  @IsOptional() @IsString() turno_trabajo?: string;
  @IsOptional() @IsString() contacto_cliente_nombre?: string;
  @IsOptional() @IsString() contacto_cliente_telefono?: string;
  @IsOptional() @IsString() contacto_cliente_correo?: string;
}

export class UpdateAvanceSemanalDto {
  @IsNumber() @Type(() => Number) porcentaje_real: number;
  @IsOptional() @IsString() estado?: string;
}

export class CreateObraResidenteDto {
  @IsOptional() @IsInt() @Type(() => Number) id_anexo?: number;
  @IsString() nombre_completo: string;
  @IsString() rol_obra: string;
  @IsOptional() @IsString() cip_cap?: string;
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() correo?: string;
  @IsOptional() @IsString() turno?: string;
  @IsOptional() @IsString() estado_planta?: string;
  @IsOptional() @IsInt() @Type(() => Number) orden?: number;
}
