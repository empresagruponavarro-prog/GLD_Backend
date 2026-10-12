import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../platform/db/pagination.dto.js';

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_REGEX = /^\d{1,12}(\.\d{1,4})?$/;

export const MEDIOS_PAGO = ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE', 'PLIN', 'OTRO'] as const;
export const CONCEPTOS_PAGO = ['PROVEEDOR', 'DETRACCION'] as const;
export const TIPOS_CUENTA = ['CAJA', 'BANCO', 'BILLETERA'] as const;
export const ESTADOS_PROGRAMACION = ['PROGRAMADO', 'EJECUTADO', 'CANCELADO'] as const;
/** Medios que dejan un numero de operacion, cheque o constancia. */
export const MEDIOS_CON_OPERACION: readonly string[] = ['CHEQUE', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE', 'PLIN'];

// ---------------------------------------------------------------- cuentas

export class CreateCuentaDto {
  @ApiProperty({ example: 'BCP-SOL-01' })
  @Matches(/^[A-Z0-9_-]{2,20}$/, { message: 'codigo: 2 a 20 caracteres en mayusculas, numeros, guion o guion bajo' })
  codigo: string;

  @ApiProperty({ example: 'BCP Soles Operativa' })
  @IsString() @MinLength(1) @MaxLength(100)
  nombre: string;

  @ApiProperty({ enum: TIPOS_CUENTA })
  @IsIn(TIPOS_CUENTA)
  tipo: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  banco?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  numero_cuenta?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  cci?: string;

  @ApiProperty({ example: 'PEN' })
  @IsString() @MaxLength(10)
  moneda_id: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_empresa?: number;
}

export class UpdateCuentaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  banco?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  numero_cuenta?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  cci?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_empresa?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  estado?: boolean;
}

export class CuentaResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ enum: TIPOS_CUENTA }) tipo: string;
  @ApiPropertyOptional() banco: string | null;
  @ApiPropertyOptional() numero_cuenta: string | null;
  @ApiPropertyOptional() cci: string | null;
  @ApiProperty() moneda_id: string;
  @ApiPropertyOptional() id_empresa: number | null;
  @ApiProperty() estado: boolean;
}

// ------------------------------------------------------------ tipo cambio

export class UpsertTipoCambioDto {
  @ApiProperty({ example: '2026-10-12' })
  @Matches(FECHA_REGEX)
  fecha: string;

  @ApiProperty({ example: 'USD' })
  @IsString() @MaxLength(10)
  moneda_id: string;

  @ApiProperty({ example: '3.7500' })
  @Matches(DECIMAL_REGEX, { message: 'compra debe ser un decimal positivo' })
  compra: string;

  @ApiProperty({ example: '3.7800' })
  @Matches(DECIMAL_REGEX, { message: 'venta debe ser un decimal positivo' })
  venta: string;
}

export class ListTipoCambioQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(FECHA_REGEX)
  desde?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(FECHA_REGEX)
  hasta?: string;

  @ApiPropertyOptional({ example: 'USD' }) @IsOptional() @IsString()
  moneda?: string;
}

export class TipoCambioResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() fecha: string;
  @ApiProperty() moneda_id: string;
  @ApiProperty() compra: string;
  @ApiProperty() venta: string;
}

// ------------------------------------------------------------ programacion

export class ProgramacionItemDto {
  @ApiProperty() @IsInt() @Min(1)
  id_documento_origen: number;

  @ApiPropertyOptional({ enum: CONCEPTOS_PAGO, default: 'PROVEEDOR' })
  @IsOptional() @IsIn(CONCEPTOS_PAGO)
  concepto?: string;

  @ApiProperty({ example: '2026-10-16', description: 'Debe ser viernes, salvo pagos urgentes' })
  @Matches(FECHA_REGEX)
  fecha_programada: string;

  @ApiProperty({ example: '500.00' })
  @Matches(DECIMAL_REGEX, { message: 'monto debe ser un decimal positivo' })
  monto: string;

  @ApiProperty({ enum: MEDIOS_PAGO })
  @IsIn(MEDIOS_PAGO)
  medio_pago: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_cuenta?: number;

  @ApiPropertyOptional({ description: 'Cuenta, CCI o celular del beneficiario' })
  @IsOptional() @IsString() @MaxLength(50)
  cuenta_destino?: string;

  @ApiPropertyOptional({ default: false, description: 'Fuera de viernes: exige observaciones' })
  @IsOptional() @IsBoolean()
  urgente?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  observaciones?: string;
}

export class CreateProgramacionDto {
  @ApiPropertyOptional({ description: 'Anexo (Trabajador) que programa' })
  @IsOptional() @IsInt() @Min(1)
  id_programado_por?: number;

  @ApiProperty({ type: [ProgramacionItemDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ProgramacionItemDto)
  items: ProgramacionItemDto[];
}

export class UpdateProgramacionDto {
  @ApiPropertyOptional() @IsOptional() @Matches(FECHA_REGEX)
  fecha_programada?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(DECIMAL_REGEX)
  monto?: string;

  @ApiPropertyOptional({ enum: MEDIOS_PAGO }) @IsOptional() @IsIn(MEDIOS_PAGO)
  medio_pago?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_cuenta?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50)
  cuenta_destino?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  urgente?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString()
  observaciones?: string;
}

export class ListProgramacionQueryDto {
  @ApiPropertyOptional({ example: '2026-10-12' }) @IsOptional() @Matches(FECHA_REGEX)
  desde?: string;

  @ApiPropertyOptional({ example: '2026-11-30' }) @IsOptional() @Matches(FECHA_REGEX)
  hasta?: string;

  @ApiPropertyOptional({ enum: ESTADOS_PROGRAMACION }) @IsOptional() @IsIn(ESTADOS_PROGRAMACION)
  estado?: string;

  @ApiPropertyOptional({ enum: CONCEPTOS_PAGO }) @IsOptional() @IsIn(CONCEPTOS_PAGO)
  concepto?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_cuenta?: number;
}

export class PendientesProgramacionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_centro_costos_principal?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_area?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_anexo?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  clase_documento?: string;

  @ApiPropertyOptional({ description: 'Vence hasta' }) @IsOptional() @Matches(FECHA_REGEX)
  vence_hasta?: string;
}

// ------------------------------------------------------------------ pagos

export class EjecutarPagoDto {
  @ApiProperty({ description: 'Programacion que se ejecuta' })
  @IsInt() @Min(1)
  id_pago_programado: number;

  @ApiProperty({ example: '2026-10-16' })
  @Matches(FECHA_REGEX)
  fecha_pago: string;

  @ApiPropertyOptional({ example: '300.00', description: 'Si es menor a lo programado, el resto queda programado' })
  @IsOptional() @Matches(DECIMAL_REGEX)
  monto?: string;

  @ApiProperty() @IsInt() @Min(1)
  id_cuenta: number;

  @ApiPropertyOptional({ enum: MEDIOS_PAGO, description: 'Por defecto el de la programacion' })
  @IsOptional() @IsIn(MEDIOS_PAGO)
  medio_pago?: string;

  @ApiPropertyOptional({ description: 'N.º de operacion, cheque o constancia de detraccion' })
  @IsOptional() @IsString() @MaxLength(50)
  numero_operacion?: string;

  @ApiPropertyOptional({ example: '3.7800', description: 'Si la cuenta esta en otra moneda; por defecto el de venta del dia' })
  @IsOptional() @Matches(DECIMAL_REGEX)
  tipo_cambio?: string;

  @ApiPropertyOptional({ description: 'Anexo (Trabajador) que ejecuta' })
  @IsOptional() @IsInt() @Min(1)
  id_ejecutado_por?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  observaciones?: string;
}

export class PagoDirectoDto {
  @ApiProperty() @IsInt() @Min(1)
  id_documento_origen: number;

  @ApiPropertyOptional({ enum: CONCEPTOS_PAGO, default: 'PROVEEDOR' })
  @IsOptional() @IsIn(CONCEPTOS_PAGO)
  concepto?: string;

  @ApiProperty({ example: '2026-10-12' })
  @Matches(FECHA_REGEX)
  fecha_pago: string;

  @ApiProperty({ example: '500.00' })
  @Matches(DECIMAL_REGEX)
  monto: string;

  @ApiProperty({ enum: MEDIOS_PAGO })
  @IsIn(MEDIOS_PAGO)
  medio_pago: string;

  @ApiProperty() @IsInt() @Min(1)
  id_cuenta: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50)
  cuenta_destino?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50)
  numero_operacion?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(DECIMAL_REGEX)
  tipo_cambio?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  id_ejecutado_por?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  observaciones?: string;
}

export class AnularPagoDto {
  @ApiPropertyOptional({ description: 'Motivo de la anulacion' })
  @IsOptional() @IsString()
  motivo?: string;
}

export class ListPagosQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(FECHA_REGEX)
  desde?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(FECHA_REGEX)
  hasta?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_documento_origen?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_cuenta?: number;

  @ApiPropertyOptional({ enum: ['REGISTRADO', 'ANULADO'] }) @IsOptional() @IsIn(['REGISTRADO', 'ANULADO'])
  estado?: string;
}

// --------------------------------------------------------------- consulta

export class ConsultaResumenQueryDto {
  @ApiPropertyOptional({ description: 'Emision desde' }) @IsOptional() @Matches(FECHA_REGEX)
  desde?: string;

  @ApiPropertyOptional({ description: 'Emision hasta' }) @IsOptional() @Matches(FECHA_REGEX)
  hasta?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_centro_costo?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_centro_costos_principal?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt()
  id_area?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  clase_documento?: string;
}

export class ConsultaRetencionesQueryDto {
  @ApiProperty({ example: '2026-10', description: 'Mes de pago YYYY-MM' })
  @Matches(/^\d{4}-\d{2}$/, { message: 'periodo debe tener formato YYYY-MM' })
  periodo: string;
}
