import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResumenPlanosDto } from '../planos-requeridos/planos-requeridos.dto.js';

export class RequisitoLiquidacionDto {
  @ApiProperty({ enum: ['ESTADO', 'AVANCE', 'FIN_REAL', 'PLANOS'] }) codigo: string;
  @ApiProperty() cumplido: boolean;
  @ApiProperty() mensaje: string;
}

export class LiquidacionObraDto {
  @ApiProperty() id_centro_costo: number;
  @ApiPropertyOptional({ nullable: true, example: 'POR LIQUIDAR' }) estado_cc: string | null;
  @ApiProperty() liquidada: boolean;
  @ApiPropertyOptional({ nullable: true }) fecha_liquidacion: string | null;
  @ApiPropertyOptional({ nullable: true }) liquidado_por: string | null;
  @ApiPropertyOptional({ nullable: true }) fecha_fin_real: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Avance real (0-100); nulo si la obra no está en el control de avance' }) avance_real: number | null;
  @ApiProperty() puede_liquidar: boolean;
  @ApiProperty({ type: RequisitoLiquidacionDto, isArray: true }) requisitos: RequisitoLiquidacionDto[];
  @ApiProperty({ type: ResumenPlanosDto }) planos: ResumenPlanosDto;
}

export class SeccionDosierDto {
  @ApiProperty({ enum: ['PRESUPUESTO_META', 'PRESUPUESTO_COMERCIAL', 'FICHA_OBRA', 'INFORME_AVANCE', 'PLANOS', 'DOCUMENTOS'] }) codigo: string;
  @ApiProperty() titulo: string;
  @ApiProperty({ description: 'Hay algo que imprimir en esta sección' }) disponible: boolean;
  @ApiProperty({ type: [String], description: 'Códigos o referencias de lo que entra (presupuestos, cantidad de planos y documentos…)' }) referencias: string[];
  @ApiPropertyOptional({ description: 'Por qué no está disponible' }) nota?: string;
}

export class DosierObraDto {
  @ApiProperty() id_centro_costo: number;
  @ApiProperty() nombre_obra: string;
  @ApiProperty({ example: '2026-11-05' }) fecha: string;
  @ApiProperty({ type: SeccionDosierDto, isArray: true, description: 'En el orden en que se arma el PDF integrado' }) secciones: SeccionDosierDto[];
  @ApiProperty({ type: ResumenPlanosDto }) planos: ResumenPlanosDto;
}
