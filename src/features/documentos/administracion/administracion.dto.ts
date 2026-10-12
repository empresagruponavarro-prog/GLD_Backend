import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { CLASES_DOCUMENTO } from '../../tesoreria/shared/tributos.js';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const ESTADOS_PAGO = ['SIN_PROGRAMAR', 'PROGRAMADO', 'PARCIAL', 'PAGADO', 'ANULADO'] as const;
export const ESTADOS_DOCUMENTO = ['REGISTRADO', 'ANULADO'] as const;
/** Clases que se registran directamente, sin lineas ni cotizaciones. */
export const CLASES_DIRECTAS = CLASES_DOCUMENTO.filter((c) => c !== 'ORDEN_COMPRA' && c !== 'ORDEN_SERVICIO');

export class ListDocumentosAdminQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'N.º de documento, proveedor, concepto o FUR' })
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: CLASES_DOCUMENTO })
  @IsOptional() @IsIn(CLASES_DOCUMENTO)
  clase_documento?: string;

  @ApiPropertyOptional({ enum: ESTADOS_DOCUMENTO })
  @IsOptional() @IsIn(ESTADOS_DOCUMENTO)
  estado?: string;

  @ApiPropertyOptional({ enum: ESTADOS_PAGO })
  @IsOptional() @IsIn(ESTADOS_PAGO)
  estado_pago?: string;

  @ApiPropertyOptional({ description: 'Total minimo' })
  @IsOptional() @Type(() => Number) @IsNumber()
  monto_min?: number;

  @ApiPropertyOptional({ description: 'Total maximo' })
  @IsOptional() @Type(() => Number) @IsNumber()
  monto_max?: number;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Emision desde' })
  @IsOptional() @Matches(FECHA_REGEX)
  fecha_desde?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional() @Matches(FECHA_REGEX)
  fecha_hasta?: string;

  @ApiPropertyOptional({ description: 'Vence desde' })
  @IsOptional() @Matches(FECHA_REGEX)
  vence_desde?: string;

  @ApiPropertyOptional({ description: 'Vence hasta' })
  @IsOptional() @Matches(FECHA_REGEX)
  vence_hasta?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional({ description: 'Grupo de centros de costos' }) @IsOptional() @Type(() => Number) @IsInt()
  id_centro_costos_principal?: number;

  @ApiPropertyOptional({ description: 'Area de la empresa' }) @IsOptional() @Type(() => Number) @IsInt()
  id_area?: number;

  @ApiPropertyOptional({ description: 'Proveedor / beneficiario' }) @IsOptional() @Type(() => Number) @IsInt()
  id_anexo?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_requerimiento?: number;
}

export class CreateDocumentoDirectoDto {
  @ApiProperty({ enum: CLASES_DIRECTAS, example: 'PAGO_SERVICIO' })
  @IsIn(CLASES_DIRECTAS)
  clase_documento: string;

  @ApiProperty({ description: 'Anexo beneficiario / proveedor' })
  @IsInt() @Min(1)
  id_anexo: number;

  @ApiProperty({ example: 'Recibo de luz octubre' })
  @IsString() @MinLength(1)
  concepto: string;

  @ApiProperty({ example: '1000.00', description: 'Base imponible (sin IGV)' })
  @Matches(/^\d{1,12}(\.\d{1,4})?$/)
  monto: string;

  @ApiProperty({ example: '2026-10-12' })
  @Matches(FECHA_REGEX)
  fecha_emision: string;

  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean()
  afecto_igv?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_centro_costo?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_fase?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_area?: number;

  @ApiPropertyOptional({ default: 'PEN' }) @IsOptional() @IsString() @MaxLength(10)
  moneda_id?: string;

  @ApiPropertyOptional({ default: 'S/' }) @IsOptional() @IsString() @MaxLength(10)
  moneda_simbolo?: string;

  @ApiPropertyOptional({ example: 'Credito 15 dias' }) @IsOptional() @IsString() @MaxLength(255)
  forma_pago?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  dias_credito?: number;

  @ApiPropertyOptional({ example: '2026-11-05', description: 'Tiene prioridad sobre los dias de credito' })
  @IsOptional() @Matches(FECHA_REGEX)
  fecha_vencimiento?: string;

  @ApiPropertyOptional({ description: '% de detraccion; 0 la quita, sin valor se propone 10 % en servicios' })
  @IsOptional() @IsNumber() @Min(0)
  detraccion_porcentaje?: number;

  @ApiPropertyOptional({ description: 'Retencion del IGV manual; sin valor se calcula' })
  @IsOptional() @IsNumber() @Min(0)
  retencion_monto?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  renta_4ta?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  dscto_compras?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  dscto_intervencion?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  dscto_otros?: number;
}

export class UpdateDeduccionesDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  renta_4ta?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  dscto_compras?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  dscto_intervencion?: number;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0)
  dscto_otros?: number;

  @ApiPropertyOptional({ description: '% de detraccion; 0 la quita' })
  @IsOptional() @IsNumber() @Min(0)
  detraccion_porcentaje?: number;

  @ApiPropertyOptional({ description: 'Retencion manual del IGV. `null` vuelve al calculo automatico.', nullable: true })
  @IsOptional() @IsNumber() @Min(0)
  retencion_monto?: number | null;

  @ApiPropertyOptional({ description: 'Si cambia, se recalculan IGV y total' })
  @IsOptional() @IsBoolean()
  afecto_igv?: boolean;

  @ApiPropertyOptional({ description: 'Dias de credito (desde la recepcion en OC)' })
  @IsOptional() @IsInt() @Min(0)
  dias_credito?: number;

  @ApiPropertyOptional({ description: 'Fecha manual; cadena vacia la quita' })
  @IsOptional() @IsString()
  fecha_vencimiento?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_area?: number;
}

export class AnularDocumentoDto {
  @ApiPropertyOptional({ description: 'Motivo, se agrega a los comentarios' })
  @IsOptional() @IsString()
  motivo?: string;
}
