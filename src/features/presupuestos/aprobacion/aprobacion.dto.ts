import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProblemaPresupuestoDto {
  @ApiProperty({ enum: ['SIN_FASES', 'FASE_SIN_CATEGORIAS', 'CATEGORIA_SIN_ITEMS', 'ITEM_VACIO'] }) codigo: string;
  @ApiProperty() mensaje: string;
  @ApiPropertyOptional() idFase?: number;
  @ApiPropertyOptional() idCategoria?: number;
  @ApiPropertyOptional() idItem?: number;
  @ApiPropertyOptional() fase?: string;
  @ApiPropertyOptional() categoria?: string;
}

export class BloqueoAprobacionDto {
  @ApiProperty({ enum: ['YA_APROBADO', 'ANULADO', 'SIN_CENTRO_COSTO', 'OTRO_PRINCIPAL', 'SIN_PRINCIPAL'] }) codigo: string;
  @ApiProperty() mensaje: string;
}

export class ResumenPresupuestoDto {
  @ApiProperty() fases: number;
  @ApiProperty() categorias: number;
  @ApiProperty() items: number;
  @ApiProperty({ example: '4224.00' }) costo_directo: string;
}

export class ValidacionPresupuestoResponseDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional() id_presupuesto: string | null;
  @ApiProperty() estado_ppto: string;
  @ApiProperty({ enum: ['Principal', 'Adicional'] }) tipo: string;
  @ApiProperty({ description: 'Verdadero si no hay problemas ni bloqueos' }) puede_aprobar: boolean;
  @ApiProperty({ type: ProblemaPresupuestoDto, isArray: true, description: 'Lo que falta completar en el presupuesto' })
  problemas: ProblemaPresupuestoDto[];
  @ApiProperty({ type: BloqueoAprobacionDto, isArray: true, description: 'Reglas de negocio que impiden aprobar' })
  bloqueos: BloqueoAprobacionDto[];
  @ApiProperty({ type: ResumenPresupuestoDto }) resumen: ResumenPresupuestoDto;
}

export class EstructuraCapturadaDto {
  @ApiProperty({ description: 'Verdadero si se crearon partidas y subpartidas en la obra' }) capturada: boolean;
  @ApiProperty() partidas: number;
  @ApiProperty() subpartidas: number;
  @ApiPropertyOptional({ description: 'Por qué no se capturó (la obra ya tiene estructura, faltan fechas del centro de costo…)' })
  motivo?: string;
}

export class AprobarPresupuestoResponseDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional() id_presupuesto: string | null;
  @ApiProperty({ example: 'APROBADO' }) estado_ppto: string;
  @ApiProperty({ enum: ['Principal', 'Adicional'] }) tipo: string;
  @ApiProperty({ type: EstructuraCapturadaDto }) estructura: EstructuraCapturadaDto;
  @ApiPropertyOptional({ description: 'Presupuesto al que reemplaza (una versión anterior que pasó a ANULADO)' })
  reemplaza?: { id: number; id_presupuesto: string | null };
}

export class FaseSinCategoriasDto {
  @ApiProperty() id: number;
  @ApiProperty() nombre: string;
}

export class LimpiarVaciosResponseDto {
  @ApiProperty() items_eliminados: number;
  @ApiProperty() categorias_eliminadas: number;
  @ApiProperty({ type: FaseSinCategoriasDto, isArray: true, description: 'Fases que quedaron sin categorías: el usuario decide' })
  fases_sin_categorias: FaseSinCategoriasDto[];
  @ApiProperty({ example: '4224.00' }) costo_directo: string;
}

export class NuevaVersionResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() id_presupuesto: string;
  @ApiProperty({ example: 2 }) numero_version: number;
  @ApiProperty() id_version_de: number;
  @ApiProperty() fases: number;
  @ApiProperty() categorias: number;
  @ApiProperty() items: number;
}

export class RequerimientoComercialDto {
  @ApiProperty() id: number;
  @ApiProperty() numero: string;
  @ApiProperty() estado: string;
  @ApiPropertyOptional({ nullable: true }) proveedor: string | null;
  @ApiProperty({ description: 'Total sin IGV de la cotización ganadora, en soles' }) monto: number;
}

export class FaseComercialDto {
  @ApiProperty() id_fase: number;
  @ApiProperty() nombre_fase: string;
  @ApiProperty({ description: 'Costo directo de la fase en el presupuesto Meta' }) meta: number;
  @ApiProperty({ description: 'Monto de la cotización ganadora; si la fase aún no tiene, el del Meta' }) comercial: number;
  @ApiProperty({ enum: ['COTIZACION', 'META'] }) fuente: 'COTIZACION' | 'META';
  @ApiProperty({ type: RequerimientoComercialDto, isArray: true }) requerimientos: RequerimientoComercialDto[];
  @ApiProperty({ description: 'Hay una ganadora en otra moneda sin tipo de cambio registrado' }) sin_tipo_cambio: boolean;
}

export class TotalComercialDto {
  @ApiProperty() meta: number;
  @ApiProperty() comercial: number;
  @ApiProperty({ description: 'Comercial − Meta' }) diferencia: number;
}

export class ComercialResponseDto {
  @ApiProperty() id: number;
  @ApiPropertyOptional({ nullable: true }) id_presupuesto: string | null;
  @ApiPropertyOptional({ nullable: true }) proyecto: string | null;
  @ApiPropertyOptional({ nullable: true }) id_centro_costo: number | null;
  @ApiProperty() estado_ppto: string;
  @ApiProperty({ type: FaseComercialDto, isArray: true }) fases: FaseComercialDto[];
  @ApiProperty({ type: TotalComercialDto }) total: TotalComercialDto;
  @ApiProperty({ description: 'Fases ya valorizadas con una cotización ganadora' }) fases_cotizadas: number;
}
