import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentoCompromisoDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'OC-000012' }) numero_documento: string;
  @ApiProperty({ enum: ['ORDEN_COMPRA', 'ORDEN_SERVICIO'] }) clase: string;
}

export class CompromisoGeneradoDto {
  @ApiProperty() id_requerimiento: number;
  @ApiProperty({ example: 'FUR-000031' }) numero: string;
  @ApiProperty() fase: string;
  @ApiProperty() id_proveedor: number;
  @ApiPropertyOptional({ nullable: true, type: String }) proveedor: string | null;
  @ApiProperty({ type: [DocumentoCompromisoDto] }) documentos: DocumentoCompromisoDto[];
}

export class CompromisoAnuladoDto {
  @ApiProperty() id_requerimiento: number;
  @ApiProperty() numero: string;
}

/** Lo que dejó la conciliación de compromisos al grabar. */
export class ConciliacionResponseDto {
  @ApiProperty({ type: [CompromisoGeneradoDto], description: 'FUR nuevos (con sus órdenes)' }) creados: CompromisoGeneradoDto[];
  @ApiProperty({ type: [CompromisoGeneradoDto], description: 'FUR que se actualizaron (mismo número, otras líneas o precios)' }) actualizados: CompromisoGeneradoDto[];
  @ApiProperty({ type: [CompromisoAnuladoDto], description: 'FUR que se anularon porque ya no tienen ítems adjudicados' }) anulados: CompromisoAnuladoDto[];
  @ApiProperty({ description: 'FUR que ya estaban al día' }) sin_cambio: number;
}

// ---------------------------------------------------------------- panel de compromisos

export class CompromisoDocumentoPanelDto {
  @ApiProperty() id: number;
  @ApiProperty({ example: 'OC-000012' }) numero_documento: string;
  @ApiProperty({ enum: ['ORDEN_COMPRA', 'ORDEN_SERVICIO'] }) clase: string;
  @ApiProperty({ enum: ['PROVISIONAL', 'REGISTRADO', 'ANULADO'] }) estado: string;
  @ApiProperty({ description: 'Total con IGV, en la moneda del documento' }) total: string;
  @ApiPropertyOptional({ nullable: true, type: String }) moneda_simbolo: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) fecha_emision: string | null;
}

export class CompromisoPanelDto {
  @ApiProperty() id_requerimiento: number;
  @ApiProperty({ example: 'FUR-000031' }) numero: string;
  @ApiProperty() estado_requerimiento: string;
  @ApiProperty({ enum: ['PROVISIONAL', 'REGISTRADO', 'ANULADO'], description: 'PROVISIONAL mientras el presupuesto no se aprueba' }) estado: string;
  @ApiPropertyOptional({ nullable: true, type: String }) fase: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) id_proveedor: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) proveedor: string | null;
  @ApiProperty() lineas: number;
  @ApiProperty({ type: [CompromisoDocumentoPanelDto] }) documentos: CompromisoDocumentoPanelDto[];
}

export class ItemSinAdjudicarDto {
  @ApiProperty() id_ppto_item: number;
  @ApiProperty() codigo: string;
  @ApiProperty() descripcion: string;
  @ApiProperty() fase: string;
}

export class ConflictoVersionDto {
  @ApiProperty() id_ppto_item: number;
  @ApiProperty() codigo: string;
  @ApiProperty({ type: [String], description: 'Órdenes registradas de versiones anteriores que ya pidieron el ítem a otro proveedor' }) documentos: string[];
}

export class CompromisosPresupuestoDto {
  @ApiProperty() id_presupuesto: number;
  @ApiProperty({ example: 'PPTO-2026-001' }) codigo_presupuesto: string;
  @ApiProperty() estado: string;
  @ApiProperty({ description: 'Ítems con cantidad' }) items_total: number;
  @ApiProperty() items_adjudicados: number;
  @ApiProperty({ type: [ItemSinAdjudicarDto], description: 'Mientras haya alguno, el presupuesto no se puede aprobar' }) items_sin_adjudicar: ItemSinAdjudicarDto[];
  @ApiProperty({ type: [ConflictoVersionDto], description: 'Ítems adjudicados a un proveedor distinto del de una orden registrada de una versión anterior: bloquean la aprobación' }) conflictos: ConflictoVersionDto[];
  @ApiProperty({ type: [CompromisoPanelDto] }) compromisos: CompromisoPanelDto[];
}
