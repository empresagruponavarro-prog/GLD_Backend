import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { CreateCotizacionDto, CuadroProveedorDto, MEDIOS_PAGO } from '../../requerimientos/cotizaciones/cotizacion.dto.js';
import { DECIMAL_REGEX } from '../../requerimientos/requerimiento/requerimiento.dto.js';
import { ConciliacionResponseDto } from '../compromisos/compromisos.dto.js';

// ------------------------------------------------------------------ entrada

/**
 * Cotización de UNA subpartida (`ppto_DetalleFasesCate`): el proveedor da un solo total por toda la subpartida y el sistema lo
 * prorratea entre sus ítems en proporción a su costo en el Meta (las líneas por ítem se calculan, no se envían).
 * Cabecera = la de la cotización de un FUR.
 */
export class CreatePptoCotizacionDto extends OmitType(CreateCotizacionDto, ['lineas'] as const) {
  @ApiProperty({ description: '`ppto_DetalleFasesCate.id`: la subpartida del presupuesto que se cotiza (un proveedor por subpartida)' })
  @IsInt()
  @Min(1)
  id_detalle_categoria: number;

  @ApiProperty({
    example: '1000.00',
    description: 'Precio total de la subpartida tal como lo dio el proveedor (con IGV si `incluye_igv`, sin IGV si no); debe ser mayor a 0',
  })
  @Matches(DECIMAL_REGEX, { message: 'total debe ser un decimal no negativo' })
  total: string;

  @ApiPropertyOptional({
    description:
      'true = este proveedor gana la subpartida completa (reemplaza al ganador actual). false = si era el ganador, la suelta. Sin valor = no cambia. ' +
      'Exige un trabajador vinculado al usuario.',
  })
  @IsOptional()
  @IsBoolean()
  adjudicar?: boolean;

  @ApiPropertyOptional({ description: 'Motivo de la adjudicación si se marca `adjudicar`' })
  @IsOptional()
  @IsString()
  comentario_adjudicacion?: string;
}

/**
 * La subpartida no se cambia: se crea otra cotización. Si se cambia `incluye_igv` o `afecto_igv` hay que volver a enviar el `total`,
 * porque cambia lo que significa; al enviar `total` se vuelve a prorratear con el costo Meta de ese momento.
 */
export class UpdatePptoCotizacionDto extends PartialType(OmitType(CreatePptoCotizacionDto, ['id_detalle_categoria'] as const)) {}

/** Elige (o quita) al ganador de una subpartida completa: sus ítems con cantidad pasan juntos al proveedor elegido. */
export class AdjudicacionDto {
  @ApiProperty({ description: '`ppto_DetalleFasesCate.id`' })
  @IsInt()
  @Min(1)
  id_detalle_categoria: number;

  @ApiProperty({ nullable: true, type: Number, description: '`ppto_cotizacion.id` ganadora de la subpartida; null = quitar el ganador (debe venir explícito)' })
  @ValidateIf((o: AdjudicacionDto) => o.id_cotizacion !== null)
  @IsInt()
  @Min(1)
  id_cotizacion: number | null;

  @ApiPropertyOptional({ description: 'Motivo de la elección (queda en cada ítem adjudicado)' })
  @IsOptional()
  @IsString()
  comentario?: string;
}

// ---------------------------------------------------------------- respuesta

export class PptoCotizacionLineaResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() id_ppto_item: number;
  @ApiPropertyOptional() numero_item: string | null;
  @ApiProperty() id_subfase: number;
  @ApiProperty() subfase: string;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty() cotiza: boolean;
  @ApiProperty() cantidad: string;
  @ApiProperty({ description: 'Cantidad que hoy pide el ítem en el presupuesto' }) cantidad_item: string;
  @ApiProperty({ description: 'La cantidad cotizada ya no coincide con la del ítem (cambió después de cotizar)' }) cantidad_distinta: boolean;
  @ApiProperty() precio_unitario: string;
  @ApiProperty({ description: 'Precio sin IGV' }) precio_sin_igv: string;
  @ApiProperty({ description: 'Precio con IGV' }) precio_con_igv: string;
  @ApiProperty() subtotal_sin_igv: string;
  @ApiPropertyOptional() plazo_entrega_dias: number | null;
  @ApiPropertyOptional() marca_modelo: string | null;
  @ApiPropertyOptional() observaciones: string | null;
  @ApiProperty({ description: 'Esta línea es la ganadora de su ítem' }) adjudicada: boolean;
}

export class PptoCotizacionResponseDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'COT-000001' }) numero: string;
  @ApiProperty() id_presupuesto: number;
  @ApiProperty() id_detalle_fase: number;
  @ApiProperty() fase: string;
  @ApiPropertyOptional({ description: '`ppto_DetalleFasesCate.id`; nulo solo en cotizaciones antiguas por ítem' }) id_detalle_categoria: number | null;
  @ApiPropertyOptional() subpartida: string | null;
  @ApiPropertyOptional({ description: 'Total de la subpartida tal como lo dio el proveedor' }) total_global: string | null;
  @ApiProperty({ description: 'Las líneas por ítem salen del prorrateo del total según el costo Meta' }) prorrateada: boolean;
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
  @ApiPropertyOptional() registrado_por: string | null;
  @ApiProperty() total_sin_igv: string;
  @ApiProperty() igv: string;
  @ApiProperty() total: string;
  @ApiProperty({ description: 'Ítems de esta cotización que ganó este proveedor (toda la subpartida o ninguno)' }) items_adjudicados: number;
  @ApiProperty({ description: 'Alguno de sus ítems ya tiene una orden registrada: la cotización es solo de consulta' }) protegida: boolean;
  @ApiProperty({ type: [PptoCotizacionLineaResponseDto] }) lineas: PptoCotizacionLineaResponseDto[];
  @ApiPropertyOptional({ type: ConciliacionResponseDto, description: 'Solo al grabar: los FUR y órdenes que se generaron o actualizaron' })
  compromisos?: ConciliacionResponseDto;
}

export class CompromisoItemDto {
  @ApiProperty() id_requerimiento: number;
  @ApiProperty() numero_requerimiento: string;
  @ApiProperty() estado_requerimiento: string;
  @ApiPropertyOptional() id_documento: number | null;
  @ApiPropertyOptional() numero_documento: string | null;
  @ApiPropertyOptional({ description: 'PROVISIONAL mientras el presupuesto no se aprueba; luego REGISTRADO' }) estado_documento: string | null;
}

export class PptoCuadroOfertaDto {
  @ApiProperty() id_cotizacion: number;
  @ApiProperty({ description: '`ppto_cotizacion_detalle.id`: es el valor de `id_cot_detalle` al adjudicar' }) id_cot_detalle: number;
  @ApiProperty() cotiza: boolean;
  @ApiProperty() cantidad: string;
  @ApiProperty() precio_sin_igv: string;
  @ApiProperty() precio_con_igv: string;
  @ApiProperty() subtotal_sin_igv: string;
  @ApiPropertyOptional() plazo_entrega_dias: number | null;
  @ApiProperty({ description: 'Cotiza la cantidad completa del ítem: solo así se puede adjudicar' }) cantidad_completa: boolean;
}

export class PptoCuadroLineaDto {
  @ApiProperty() id_ppto_item: number;
  @ApiPropertyOptional() numero_item: string | null;
  @ApiProperty() id_subfase: number;
  @ApiProperty() subfase: string;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() unidad: string;
  @ApiProperty() cantidad: string;
  @ApiProperty({ description: 'Costo unitario del Meta' }) costo_unitario_meta: string;
  @ApiProperty({ description: 'Costo total del Meta' }) costo_total_meta: string;
  @ApiPropertyOptional() id_cot_detalle_ganadora: number | null;
  @ApiPropertyOptional() id_cotizacion_ganadora: number | null;
  @ApiPropertyOptional() adjudicado_por: string | null;
  @ApiPropertyOptional() fecha_adjudicacion: string | null;
  @ApiPropertyOptional() comentario_adjudicacion: string | null;
  @ApiProperty({ description: 'La cantidad de la oferta ganadora ya no coincide con la del ítem' }) cantidad_distinta: boolean;
  @ApiProperty({ description: 'El ítem ya tiene una orden registrada: no cambia de proveedor' }) cubierto: boolean;
  @ApiPropertyOptional({ type: CompromisoItemDto }) compromiso: CompromisoItemDto | null;
  @ApiProperty({ type: [PptoCuadroOfertaDto] }) ofertas: PptoCuadroOfertaDto[];
}

export class PptoCuadroProveedorDto extends OmitType(CuadroProveedorDto, ['es_ganadora'] as const) {
  @ApiProperty({ description: 'Ítems de la subpartida que gana este proveedor' }) items_ganados: number;
  @ApiProperty({ description: 'Este proveedor es el ganador de la subpartida' }) es_ganadora: boolean;
  @ApiPropertyOptional({ description: 'Total de la subpartida tal como lo dio el proveedor' }) total_global: string | null;
}

export class PptoCuadroComparativoDto {
  @ApiProperty() id_presupuesto: number;
  @ApiProperty({ example: 'PPTO-2026-001' }) codigo_presupuesto: string;
  @ApiProperty() estado: string;
  @ApiProperty({ description: '`ppto_DetalleFasesCate.id`' }) id_detalle_categoria: number;
  @ApiProperty() subpartida: string;
  @ApiProperty() id_detalle_fase: number;
  @ApiProperty() fase: string;
  @ApiProperty({ description: 'Ítems de la subpartida' }) items_total: number;
  @ApiProperty({ description: 'Ítems con ganador (todos o ninguno)' }) items_adjudicados: number;
  @ApiPropertyOptional({ description: '`ppto_cotizacion.id` ganadora de la subpartida' }) id_cotizacion_ganadora: number | null;
  @ApiProperty({ type: [PptoCuadroLineaDto] }) lineas: PptoCuadroLineaDto[];
  @ApiProperty({ type: [PptoCuadroProveedorDto] }) proveedores: PptoCuadroProveedorDto[];
}

export class AdjudicacionResponseDto {
  @ApiProperty({ description: 'Ítems que cambiaron de ganador' }) adjudicados: number;
  @ApiProperty({ description: 'Ítems a los que se les quitó el ganador' }) liberados: number;
  @ApiProperty({ description: 'Ítems que ya tenían ese ganador' }) sin_cambio: number;
  @ApiProperty({ type: ConciliacionResponseDto, description: 'Los FUR y órdenes que se generaron, actualizaron o anularon' }) compromisos: ConciliacionResponseDto;
}
