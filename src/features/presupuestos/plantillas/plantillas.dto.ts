import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

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

  @ApiProperty({ example: 'a47efc23' })
  @IsString()
  @IsNotEmpty()
  CodCentroCto: string;

  @ApiProperty({ example: '617d63d6' })
  @IsString()
  @IsNotEmpty()
  CodCentroCtoPrincipal: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_empresa: number;

  @ApiProperty({ example: 42 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_centro_costo: number;
}
