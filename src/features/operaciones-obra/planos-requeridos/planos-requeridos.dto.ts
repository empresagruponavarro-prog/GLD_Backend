import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ArchivoRequeridoDto {
  @ApiProperty({ description: 'Plano vigente de la obra (obra_planos) con el mismo código' }) id_plano: number;
  @ApiProperty({ example: 'v1.0' }) version: string;
  @ApiPropertyOptional({ nullable: true, example: 'PDF (2.4 MB)' }) formato_peso: string | null;
}

export class PlanoRequeridoDto {
  @ApiProperty() id_tipo_plano: number;
  @ApiProperty({ example: 'A01' }) codigo: string;
  @ApiProperty({ example: 'PLANO DE DISTRIBUCIÓN' }) nombre: string;
  @ApiPropertyOptional({ nullable: true, example: 'ARQUITECTURA' }) disciplina: string | null;
  @ApiProperty() obligatorio: boolean;
  @ApiProperty() entregado: boolean;
  @ApiPropertyOptional({ nullable: true }) entregado_por: string | null;
  @ApiPropertyOptional({ nullable: true }) entregado_en: string | null;
  @ApiPropertyOptional({ type: ArchivoRequeridoDto, nullable: true, description: 'Sin archivo no se puede marcar como entregado' })
  archivo: ArchivoRequeridoDto | null;
}

export class FaltantePlanoDto {
  @ApiProperty() id_tipo_plano: number;
  @ApiProperty() codigo: string;
  @ApiProperty() nombre: string;
}

export class ResumenPlanosDto {
  @ApiProperty() total: number;
  @ApiProperty() obligatorios: number;
  @ApiProperty() entregados_obligatorios: number;
  @ApiProperty({ type: FaltantePlanoDto, isArray: true }) faltantes: FaltantePlanoDto[];
  @ApiProperty({ description: 'No falta ningún plano obligatorio' }) completo: boolean;
}

export class PlanosRequeridosObraDto {
  @ApiProperty() id_centro_costo: number;
  @ApiPropertyOptional({ nullable: true }) id_tipo_proyecto: number | null;
  @ApiPropertyOptional({ nullable: true }) tipo_proyecto: string | null;
  @ApiProperty({ type: PlanoRequeridoDto, isArray: true }) items: PlanoRequeridoDto[];
  @ApiProperty({ type: ResumenPlanosDto }) resumen: ResumenPlanosDto;
}

export class MarcarPlanoDto {
  @ApiProperty({ description: 'true = plano entregado (check); false = quitar el check' })
  @IsBoolean()
  entregado: boolean;
}
