import { ApiProperty } from '@nestjs/swagger';

export class CotizacionOmitidaDto {
  @ApiProperty() id_cotizacion: number;
  @ApiProperty({ example: 'COT-2026-000123' }) numero: string;
  @ApiProperty({
    enum: ['ORDEN_REGISTRADA', 'SIN_BASE_PARA_REPARTIR'],
    description:
      'ORDEN_REGISTRADA: alguno de sus ítems ya tiene una orden registrada, así que la cotización no se toca. ' +
      'SIN_BASE_PARA_REPARTIR: la subpartida ya no tiene ítems con cantidad o con costo Meta sobre el cual repartir el total.',
  })
  motivo: 'ORDEN_REGISTRADA' | 'SIN_BASE_PARA_REPARTIR';
}

/**
 * Lo que pasó con las cotizaciones de una subpartida cuando cambió lo que las sostiene (precio Meta, cantidades o ítems). El total que dio
 * cada proveedor no cambia; solo cómo se reparte entre los ítems (plan 11, D-5).
 */
export class ReprorrateoResponseDto {
  @ApiProperty({ description: 'Cotizaciones cuyas líneas se volvieron a repartir (solo las que realmente cambiaron)' })
  actualizadas: number;

  @ApiProperty({ type: () => [CotizacionOmitidaDto], description: 'Cotizaciones que no se tocaron, y por qué' })
  omitidas: CotizacionOmitidaDto[];
}
