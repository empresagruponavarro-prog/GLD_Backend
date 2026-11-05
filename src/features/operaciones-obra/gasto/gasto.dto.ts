import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GastoSubfaseDto {
  @ApiPropertyOptional({ nullable: true, description: 'Subfase (categoría del presupuesto); nulo = gasto sin subfase' }) id_ppto_detalle_categoria: number | null;
  @ApiProperty() subfase: string;
  @ApiPropertyOptional({ nullable: true, description: 'Monto de la subpartida en el presupuesto Meta' }) meta: number | null;
  @ApiProperty({ description: 'Servicios de OC/OS no anuladas' }) directo: number;
  @ApiProperty({ description: 'Salidas de almacén (PECOSA) a la obra: cantidad × costo' }) indirecto: number;
  @ApiProperty({ description: 'Bienes comprados que todavía no salieron: OC de bienes − indirecto, sin bajar de 0' }) compromiso: number;
  @ApiProperty({ description: 'Directo + indirecto' }) ejecutado: number;
  @ApiProperty({ description: 'Ejecutado + compromiso' }) proyectado: number;
  @ApiPropertyOptional({ nullable: true, description: 'Meta − proyectado' }) saldo: number | null;
  @ApiProperty() sobre_meta: boolean;
}

export class TotalesGastoDto {
  @ApiProperty() meta: number;
  @ApiProperty() directo: number;
  @ApiProperty() indirecto: number;
  @ApiProperty() compromiso: number;
  @ApiProperty() ejecutado: number;
  @ApiProperty() proyectado: number;
  @ApiProperty() saldo: number;
}

export class GastoObraDto {
  @ApiProperty() id_centro_costo: number;
  @ApiProperty({ type: GastoSubfaseDto, isArray: true }) subfases: GastoSubfaseDto[];
  @ApiProperty({ type: TotalesGastoDto }) total: TotalesGastoDto;
  @ApiProperty({ description: 'Líneas en otra moneda sin tipo de cambio registrado: no están en las sumas' }) lineas_sin_tipo_cambio: number;
}
