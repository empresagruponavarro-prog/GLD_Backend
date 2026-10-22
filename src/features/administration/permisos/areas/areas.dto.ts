import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';

/** Niveles que se pueden guardar para un módulo de un área (sin fila = el área no lo ve). */
export const NIVELES_AREA_GUARDABLES = ['solo_ver', 'completo'] as const;
export type NivelAreaGuardable = (typeof NIVELES_AREA_GUARDABLES)[number];

/** Un módulo del catálogo tal como lo muestra la matriz "Módulos por área". */
export class ModuloMatrizAreaDto {
  @ApiProperty({ example: 10 })
  id: number;

  @ApiProperty({ example: 'tesoreria.pagos' })
  clave: string;

  @ApiProperty({ example: 'Ejecución de pagos' })
  nombre: string;

  @ApiProperty({ example: 'Tesorería', description: 'Grupo del menú al que pertenece' })
  grupo: string;

  @ApiProperty({
    example: true,
    description: 'false para Administración y el menú de módulos: no dependen del área, solo del rol',
  })
  configurable: boolean;
}

/** Módulo habilitado en un área. */
export class AccesoAreaDto {
  @ApiProperty({ example: 'tesoreria.pagos' })
  clave: string;

  @ApiProperty({ enum: NIVELES_AREA_GUARDABLES, example: 'completo' })
  nivel: NivelAreaGuardable;
}

export class AreaMatrizDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'PROCURA' })
  codigo: string;

  @ApiProperty({ example: 'Procura' })
  nombre: string;

  @ApiProperty({ example: true })
  estado: boolean;

  @ApiProperty({ example: 10, description: 'Usuarios ACTIVOS asignados al área' })
  usuarios: number;

  @ApiProperty({
    example: true,
    description: 'false si el área no tiene ningún módulo: mientras tanto sus usuarios NO tienen restricción por área',
  })
  configurada: boolean;

  @ApiProperty({ type: AccesoAreaDto, isArray: true, description: 'Solo los módulos habilitados (sin fila = no)' })
  modulos: AccesoAreaDto[];
}

export class MatrizAreasDto {
  @ApiProperty({ type: ModuloMatrizAreaDto, isArray: true, description: 'Módulos activos, en el orden del catálogo' })
  modulos: ModuloMatrizAreaDto[];

  @ApiProperty({ type: AreaMatrizDto, isArray: true, description: 'Todas las áreas (activas e inactivas), por nombre' })
  areas: AreaMatrizDto[];

  @ApiProperty({
    type: String,
    isArray: true,
    example: ['tesoreria.pagos'],
    description: 'Claves de módulos configurables que NO están habilitados en ninguna área',
  })
  sin_area: string[];
}

/** Entrada del PUT: nivel de un módulo para el área. */
export class AccesoAreaEntradaDto {
  @ApiProperty({ example: 'almacen.stock', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  clave: string;

  @ApiProperty({ enum: NIVELES_AREA_GUARDABLES, example: 'solo_ver' })
  @IsIn(NIVELES_AREA_GUARDABLES)
  nivel: NivelAreaGuardable;
}

export class ActualizarModulosAreaDto {
  @ApiProperty({
    type: AccesoAreaEntradaDto,
    isArray: true,
    description: 'Los módulos habilitados del área (los que no vengan quedan sin acceso). Puede ir vacío.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AccesoAreaEntradaDto)
  modulos: AccesoAreaEntradaDto[];
}
