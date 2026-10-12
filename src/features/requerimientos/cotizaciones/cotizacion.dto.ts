import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  ValidateNested,
} from 'class-validator';
import { DECIMAL_REGEX, FECHA_REGEX } from '../requerimiento/requerimiento.dto.js';

export const MEDIOS_PAGO = ['EFECTIVO', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE', 'PLIN', 'OTRO'] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export class CotizacionLineaDto {
  @ApiProperty({ description: 'requerimiento_detalle.id que se cotiza' })
  @IsInt()
  @Min(1)
  id_requerimiento_detalle: number;

  @ApiPropertyOptional({ default: true, description: 'false = el proveedor no ofrece este item' })
  @IsOptional()
  @IsBoolean()
  cotiza?: boolean;

  @ApiProperty({ example: '10', description: 'Cantidad que ofrece (no puede superar la solicitada)' })
  @Matches(DECIMAL_REGEX, { message: 'cantidad debe ser un decimal no negativo' })
  cantidad: string;

  @ApiProperty({ example: '22.50', description: 'Precio unitario tal como lo dio el proveedor (ver incluye_igv)' })
  @Matches(DECIMAL_REGEX, { message: 'precio_unitario debe ser un decimal no negativo' })
  precio_unitario: string;

  @ApiPropertyOptional({ description: 'Dias de entrega de este item si difiere de la cabecera' })
  @IsOptional()
  @IsInt()
  @Min(0)
  plazo_entrega_dias?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  marca_modelo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class CreateCotizacionDto {
  @ApiProperty({ description: 'Anexo de tipo Proveedor' })
  @IsInt()
  @Min(1)
  id_proveedor: number;

  @ApiProperty({ example: '2026-10-12' })
  @Matches(FECHA_REGEX, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha: string;

  @ApiPropertyOptional({ description: 'N.º de cotizacion del proveedor' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referencia?: string;

  @ApiProperty({ example: 'PEN' })
  @IsString()
  @MaxLength(10)
  moneda_id: string;

  @ApiPropertyOptional({ example: 'S/' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  moneda_simbolo?: string;

  @ApiPropertyOptional({ default: false, description: 'Los precios ya incluyen IGV' })
  @IsOptional()
  @IsBoolean()
  incluye_igv?: boolean;

  @ApiPropertyOptional({ default: true, description: 'false = proveedor no afecto al IGV' })
  @IsOptional()
  @IsBoolean()
  afecto_igv?: boolean;

  @ApiProperty({ example: 'Credito 15 dias' })
  @IsString()
  @MaxLength(50)
  forma_pago: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  dias_credito?: number;

  @ApiPropertyOptional({ example: '30', description: '% de adelanto que pide el proveedor' })
  @IsOptional()
  @Matches(DECIMAL_REGEX)
  adelanto_porcentaje?: string;

  @ApiPropertyOptional({ enum: MEDIOS_PAGO, description: 'Medio de pago que pide el proveedor' })
  @IsOptional()
  @IsIn(MEDIOS_PAGO)
  medio_pago?: MedioPago;

  @ApiPropertyOptional({ description: 'Dias para entregar (0 = inmediata)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  plazo_entrega_dias?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  validez_dias?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  garantia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  condiciones?: string;

  @ApiPropertyOptional({ description: 'Enlace al PDF de la cotizacion' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  archivo_url?: string;

  @ApiProperty({ type: [CotizacionLineaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CotizacionLineaDto)
  lineas: CotizacionLineaDto[];
}

export class UpdateCotizacionDto extends PartialType(CreateCotizacionDto) {}

export class CotizacionLineaResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() id_requerimiento_detalle: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty() cotiza: boolean;
  @ApiProperty() cantidad: string;
  @ApiProperty() precio_unitario: string;
  @ApiProperty({ description: 'Precio sin IGV' }) precio_sin_igv: string;
  @ApiProperty({ description: 'Precio con IGV' }) precio_con_igv: string;
  @ApiProperty() subtotal_sin_igv: string;
  @ApiPropertyOptional() plazo_entrega_dias: number | null;
  @ApiPropertyOptional() marca_modelo: string | null;
  @ApiPropertyOptional() observaciones: string | null;
}

export class CotizacionResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'COT-000001' }) numero: string;
  @ApiProperty() id_requerimiento: number;
  @ApiProperty() id_proveedor: number;
  @ApiPropertyOptional() proveedor: string | null;
  @ApiProperty() fecha: string;
  @ApiPropertyOptional() referencia: string | null;
  @ApiProperty() moneda_id: string;
  @ApiPropertyOptional() moneda_simbolo: string | null;
  @ApiProperty() incluye_igv: boolean;
  @ApiProperty() afecto_igv: boolean;
  @ApiProperty() forma_pago: string;
  @ApiProperty() dias_credito: number;
  @ApiPropertyOptional() adelanto_porcentaje: string | null;
  @ApiPropertyOptional({ enum: MEDIOS_PAGO }) medio_pago: string | null;
  @ApiPropertyOptional() plazo_entrega_dias: number | null;
  @ApiPropertyOptional() validez_dias: number | null;
  @ApiPropertyOptional() garantia: string | null;
  @ApiPropertyOptional() condiciones: string | null;
  @ApiPropertyOptional() archivo_url: string | null;
  @ApiProperty() total_sin_igv: string;
  @ApiProperty() igv: string;
  @ApiProperty() total: string;
  @ApiProperty() es_ganadora: boolean;
  @ApiProperty({ type: [CotizacionLineaResponseDto] }) lineas: CotizacionLineaResponseDto[];
}

export class CuadroLineaOfertaDto {
  @ApiProperty() id_cotizacion: number;
  @ApiProperty() cotiza: boolean;
  @ApiProperty() cantidad: string;
  @ApiProperty() precio_sin_igv: string;
  @ApiProperty() precio_con_igv: string;
  @ApiProperty() subtotal_sin_igv: string;
  @ApiPropertyOptional() plazo_entrega_dias: number | null;
}

export class CuadroLineaDto {
  @ApiProperty() id_detalle: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty() cantidad: string;
  @ApiProperty({ type: [CuadroLineaOfertaDto] }) ofertas: CuadroLineaOfertaDto[];
}

export class CuadroProveedorDto {
  @ApiProperty() id_cotizacion: number;
  @ApiProperty() numero: string;
  @ApiProperty() id_proveedor: number;
  @ApiPropertyOptional() proveedor: string | null;
  @ApiProperty() moneda_id: string;
  @ApiPropertyOptional() moneda_simbolo: string | null;
  @ApiProperty() forma_pago: string;
  @ApiProperty() dias_credito: number;
  @ApiPropertyOptional() adelanto_porcentaje: string | null;
  @ApiPropertyOptional() medio_pago: string | null;
  @ApiPropertyOptional() plazo_entrega_dias: number | null;
  @ApiPropertyOptional() validez_dias: number | null;
  @ApiPropertyOptional() garantia: string | null;
  @ApiPropertyOptional() condiciones: string | null;
  @ApiProperty() afecto_igv: boolean;
  @ApiProperty() incluye_igv: boolean;
  @ApiProperty() total_sin_igv: string;
  @ApiProperty() igv: string;
  @ApiProperty() total: string;
  @ApiPropertyOptional({ description: 'Total convertido a soles para comparar' }) total_soles: string | null;
  @ApiPropertyOptional() tc_usado: string | null;
  @ApiProperty() es_ganadora: boolean;
}

export class CuadroComparativoDto {
  @ApiProperty() id_requerimiento: number;
  @ApiProperty() numero: string;
  @ApiProperty() estado: string;
  @ApiProperty() tipo: string;
  @ApiPropertyOptional() id_cotizacion_ganadora: number | null;
  @ApiPropertyOptional() comentario_adjudicacion: string | null;
  @ApiProperty({ type: [CuadroLineaDto] }) lineas: CuadroLineaDto[];
  @ApiProperty({ type: [CuadroProveedorDto] }) proveedores: CuadroProveedorDto[];
}
