import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';

export const TIPO_OC_VALUES = ['PRODUCTO', 'SERVICIO'] as const;
export type TipoOc = (typeof TIPO_OC_VALUES)[number];

export class CreateDocumentoOrigenDetalleDto {
  @ApiProperty({ example: 1, description: 'ID del producto (tabla producto)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_producto: number;

  @ApiProperty({ example: 2, description: 'Cantidad' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cantidad: number;

  @ApiProperty({ example: 100.5, description: 'Precio unitario' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precio: number;
}

export class CreateDocumentoOrigenDto {
  @ApiPropertyOptional({ example: 'OC-001', description: 'Código IdOC' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  id_oc?: string;

  @ApiPropertyOptional({ example: 'DIRECTO' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tipo_costo?: string;

  @ApiPropertyOptional({ enum: TIPO_OC_VALUES, example: 'PRODUCTO' })
  @IsOptional()
  @IsIn(TIPO_OC_VALUES)
  tipo_oc?: TipoOc;

  @ApiPropertyOptional({ example: '0001-2026' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  numero_oc?: string;

  @ApiPropertyOptional({ example: 884, description: 'ID del Centro de Costo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_centro_costo?: number;

  @ApiPropertyOptional({ example: 3, description: 'ID de categoría' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_categoria?: number;

  @ApiPropertyOptional({ example: 1, description: 'ID de la fase de presupuesto' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_fase?: number;

  @ApiPropertyOptional({ example: '2026' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  periodo?: string;

  @ApiPropertyOptional({ example: 'ENERO' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  mes?: string;

  @ApiPropertyOptional({ example: 10, description: 'ID del anexo (proveedor/cliente)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_anexo?: number;

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00.000Z', description: 'Fecha de emisión ISO 8601' })
  @IsOptional()
  @IsDateString()
  fecha_emision?: string;

  @ApiPropertyOptional({ example: 'CREDITO' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  forma_pago?: string;

  @ApiPropertyOptional({ example: 'PEN' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  moneda_id?: string;

  @ApiPropertyOptional({ example: 'S/' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  moneda_simbolo?: string;

  @ApiPropertyOptional({ example: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  igv?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  renta_4ta?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dscto_compras?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dscto_intervencion?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dscto_otros?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comentarios?: string;

  @ApiPropertyOptional({ example: 'oc-001.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  oc_pdf?: string;

  @ApiPropertyOptional({ example: 'admin@luadag.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  usuario?: string;

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00.000Z', description: 'Fecha de creación ISO 8601' })
  @IsOptional()
  @IsDateString()
  fecha_creacion?: string;

  @ApiPropertyOptional({ example: '10:30' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  hora_creacion?: string;

  @ApiPropertyOptional({ example: 'COT-001' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cotizacion?: string;

  @ApiPropertyOptional({
    type: [CreateDocumentoOrigenDetalleDto],
    description: 'Detalle de productos (se guarda en ordenCompraDetalle)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentoOrigenDetalleDto)
  detalles?: CreateDocumentoOrigenDetalleDto[];
}

export class UpdateDocumentoOrigenDto extends PartialType(CreateDocumentoOrigenDto) {}

export class ListDocumentosOrigenQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busqueda parcial por IdOC o NumeroOC' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: TIPO_OC_VALUES, description: 'Filtro por tipo de OC' })
  @IsOptional()
  @IsIn(TIPO_OC_VALUES)
  tipo_oc?: TipoOc;

  @ApiPropertyOptional({ description: 'Filtro por periodo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  periodo?: string;

  @ApiPropertyOptional({ description: 'Filtro por mes' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  mes?: string;

  @ApiPropertyOptional({ example: 42, description: 'Filtro por Centro de Costo (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_centro_costo?: number;

  @ApiPropertyOptional({ example: 3, description: 'Filtro por categoría (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_categoria?: number;

  @ApiPropertyOptional({ example: 1, description: 'Filtro por fase de presupuesto (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_fase?: number;

  @ApiPropertyOptional({ example: 10, description: 'Filtro por anexo (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_anexo?: number;
}

export class DetallePorFaseQueryDto {
  @ApiPropertyOptional({ example: 197, description: 'ID del Centro de Costo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_centro_costo?: number;

  @ApiPropertyOptional({ example: 3, description: 'ID de la fase (ppto_Fases.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_fase?: number;
}

export class DocumentoOrigenDetalleLineaResponseDto {
  @ApiProperty({ example: 235 })
  id_documento: number;

  @ApiPropertyOptional({ example: 'OC-001' })
  id_oc: string | null;

  @ApiPropertyOptional({ example: '0001-2026' })
  numero_oc: string | null;

  @ApiPropertyOptional({ example: 197 })
  id_centro_costo: number | null;

  @ApiPropertyOptional({ example: '3A BARTOLOME ADICIONAL' })
  nombre_centro_costo: string | null;

  @ApiPropertyOptional({ example: 3 })
  id_fase: number | null;

  @ApiPropertyOptional({ example: 'ESTRUCTURA' })
  nombre_fase: string | null;

  @ApiPropertyOptional({ example: 1327 })
  id_anexo: number | null;

  @ApiPropertyOptional({ example: '2026-09-21T03:52:06.105Z' })
  fecha_emision: string | null;

  @ApiProperty({ example: 682 })
  id_detalle: number;

  @ApiPropertyOptional({ example: 8395 })
  id_producto: number | null;

  @ApiPropertyOptional({ example: 'c3b626f6' })
  producto_codigo: string | null;

  @ApiPropertyOptional({ example: '1/2 BOLSA DE CEMENTO APU' })
  producto_descripcion: string | null;

  @ApiPropertyOptional({ example: 'PRODUCTO' })
  tipo_producto: string | null;

  @ApiPropertyOptional({ example: '4.00' })
  cantidad: string | null;

  @ApiPropertyOptional({ example: '44.00' })
  precio: string | null;

  @ApiPropertyOptional({ example: '176.00' })
  monto: string | null;
}

export class DocumentoOrigenDetalleResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiPropertyOptional({ example: 1, description: 'ID del producto resuelto por código' })
  id_producto: number | null;

  @ApiPropertyOptional({ example: '9d168e9c' })
  producto_codigo: string | null;

  @ApiPropertyOptional({ example: 'CEMENTO PORTLAND TIPO I', description: 'Descripción del producto' })
  producto_descripcion: string | null;

  @ApiPropertyOptional({ example: 'PRODUCTO' })
  tipo_producto: string | null;

  @ApiPropertyOptional({ example: '2.00' })
  cantidad: string | null;

  @ApiPropertyOptional({ example: '100.00' })
  precio: string | null;

  @ApiPropertyOptional({ example: '200.00' })
  monto: string | null;
}

export class DocumentoOrigenResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiPropertyOptional({ example: 'OC-001' })
  id_oc: string | null;

  @ApiPropertyOptional({ example: 'DIRECTO' })
  tipo_costo: string | null;

  @ApiPropertyOptional({ example: 'MATERIAL' })
  tipo_oc: string | null;

  @ApiPropertyOptional({ example: '0001-2026' })
  numero_oc: string | null;

  @ApiPropertyOptional({ example: 884 })
  id_centro_costo: number | null;

  @ApiPropertyOptional({ example: 'TAMBO DINTILHAC C1 SAN MIGUEL', description: 'Nombre del centro de costo' })
  nombre_centro_costo: string | null;

  @ApiPropertyOptional({ example: 'MATERIALES', description: 'Nombre/descripción de la categoría' })
  nombre_categoria: string | null;

  @ApiPropertyOptional({ example: 'ACME S.A.C.', description: 'Nombre del anexo (proveedor/cliente)' })
  nombre_anexo: string | null;

  @ApiPropertyOptional({ example: 3 })
  id_categoria: number | null;

  @ApiPropertyOptional({ example: 1 })
  id_fase: number | null;

  @ApiPropertyOptional({ example: 'OBRA GRUESA', description: 'Nombre de la fase (ppto_Fases.FaseProyecto)' })
  nombre_fase: string | null;

  @ApiPropertyOptional({ example: '2026' })
  periodo: string | null;

  @ApiPropertyOptional({ example: 'ENERO' })
  mes: string | null;

  @ApiPropertyOptional({ example: 10 })
  id_anexo: number | null;

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00.000Z' })
  fecha_emision: string | null;

  @ApiPropertyOptional({ example: 'CREDITO' })
  forma_pago: string | null;

  @ApiPropertyOptional({ example: 'PEN' })
  moneda_id: string | null;

  @ApiPropertyOptional({ example: 'S/' })
  moneda_simbolo: string | null;

  @ApiPropertyOptional({ example: '1000.00' })
  monto: string | null;

  @ApiPropertyOptional({ example: '180.00' })
  igv: string | null;

  @ApiPropertyOptional({ example: '0.00' })
  renta_4ta: string | null;

  @ApiPropertyOptional({ example: '0.00' })
  dscto_compras: string | null;

  @ApiPropertyOptional({ example: '0.00' })
  dscto_intervencion: string | null;

  @ApiPropertyOptional({ example: '0.00' })
  dscto_otros: string | null;

  @ApiPropertyOptional({ example: '1180.00' })
  total: string | null;

  @ApiPropertyOptional({ nullable: true })
  comentarios: string | null;

  @ApiPropertyOptional({ example: 'oc-001.pdf' })
  oc_pdf: string | null;

  @ApiPropertyOptional({ example: 'admin@luadag.com' })
  usuario: string | null;

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00.000Z' })
  fecha_creacion: string | null;

  @ApiPropertyOptional({ example: '10:30' })
  hora_creacion: string | null;

  @ApiPropertyOptional({ example: 'COT-001' })
  cotizacion: string | null;

  @ApiPropertyOptional({ type: [DocumentoOrigenDetalleResponseDto] })
  detalles: DocumentoOrigenDetalleResponseDto[];
}
