import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class PlantillaResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'TPL-001' })
  IdPlantilla: string;

  @ApiProperty({ example: 'Obra Gruesa - Aruma' })
  Nombre: string;

  @ApiPropertyOptional({ example: 'Plantilla estándar para remodelaciones' })
  Descripcion?: string;

  @ApiProperty({ example: true })
  Activo: boolean;

  @ApiProperty({ example: '2026-10-02T14:00:00Z' })
  FechaCreacion: string;
}

export class PlantillaCategoriaDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'TPLF-001' })
  IdPlantillaFase: string;

  @ApiProperty({ example: 'e65a0b3f' })
  IdpptoFaseCategoria: string;

  @ApiPropertyOptional({ example: 'OBRAS PROVISIONALES' })
  NombreCategoria?: string;

  @ApiPropertyOptional({ example: 5000 })
  CostoReferencial?: number;
}

export class PlantillaFaseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'TPLF-001' })
  IdPlantillaFase: string;

  @ApiProperty({ example: '11dcff08' })
  IdpptoFase: string;

  @ApiPropertyOptional({ example: 'OBRA GRUESA' })
  NombreFase?: string;

  @ApiProperty({ example: 0 })
  Orden: number;

  @ApiProperty({ type: () => [PlantillaCategoriaDto] })
  categorias: PlantillaCategoriaDto[];
}

export class PlantillaCompletaResponseDto extends PlantillaResponseDto {
  @ApiProperty({ type: () => [PlantillaFaseDto] })
  fases: PlantillaFaseDto[];
}

// ─── Create / Update DTOs ─────────────────────────────────────────────────────

export class CreatePlantillaDto {
  @ApiPropertyOptional({ example: 'TPL-REMODELACION-01' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  IdPlantilla?: string;

  @ApiProperty({ example: 'Obra Gruesa - Estándar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  Nombre: string;

  @ApiPropertyOptional({ example: 'Plantilla para obras de remodelación' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  Descripcion?: string;
}

export class UpdatePlantillaDto extends PartialType(CreatePlantillaDto) {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  Activo?: boolean;
}

export class UpsertPlantillaCategoriaDto {
  @ApiPropertyOptional({ example: 'TPLF-001' })
  @IsOptional()
  @IsString()
  IdPlantillaFase?: string;

  @ApiProperty({ example: 'e65a0b3f' })
  @IsString()
  @IsNotEmpty()
  IdpptoFaseCategoria: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  CostoReferencial?: number;
}

export class UpsertPlantillaFaseDto {
  @ApiPropertyOptional({ example: 'TPLF-001' })
  @IsOptional()
  @IsString()
  IdPlantillaFase?: string;

  @ApiProperty({ example: '11dcff08' })
  @IsString()
  @IsNotEmpty()
  IdpptoFase: string;

  @ApiProperty({ example: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  Orden: number;

  @ApiProperty({ type: () => [UpsertPlantillaCategoriaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertPlantillaCategoriaDto)
  categorias: UpsertPlantillaCategoriaDto[];
}

// ─── Aplicar DTO ─────────────────────────────────────────────────────────────

export class AplicarPlantillaDto {
  @ApiProperty({ example: 'TPL-001' })
  @IsString()
  @IsNotEmpty()
  IdPlantilla: string;

  @ApiPropertyOptional({ enum: ['agregar', 'reemplazar'], default: 'agregar', description: 'agregar: conserva lo existente y no duplica. reemplazar: borra las fases/categorías actuales del presupuesto.' })
  @IsOptional()
  @IsIn(['agregar', 'reemplazar'])
  Modo?: 'agregar' | 'reemplazar';

  @ApiPropertyOptional({ example: 'jperez' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Usuario?: string;

  // Opcionales: por defecto se toman del propio presupuesto.
  @ApiPropertyOptional({ example: 'a47efc23' })
  @IsOptional()
  @IsString()
  CodCentroCto?: string;

  @ApiPropertyOptional({ example: '617d63d6' })
  @IsOptional()
  @IsString()
  CodCentroCtoPrincipal?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_empresa?: number;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_centro_costo?: number;
}

export class AplicarPlantillaResultDto {
  @ApiProperty() success: boolean;
  @ApiProperty({ enum: ['agregar', 'reemplazar'] }) modo: 'agregar' | 'reemplazar';
  @ApiProperty() fasesAgregadas: number;
  @ApiProperty() categoriasAgregadas: number;
  @ApiProperty({ description: 'Fases de la plantilla que el presupuesto ya tenía' }) fasesOmitidas: number;
  @ApiProperty({ description: 'Categorías de la plantilla que el presupuesto ya tenía' }) categoriasOmitidas: number;
}
