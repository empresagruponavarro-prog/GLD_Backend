import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export type EstadoEquipo = 'Operativo' | 'En reparación' | 'De baja';

export class NuevaAsignacionDto {
  @ApiProperty({ example: 'Laptop01', description: 'Código del bien (catálogo, clase Activo Fijo)' })
  @IsString()
  @MaxLength(50)
  codigoBien!: string;

  @ApiPropertyOptional({ example: 'PF4ABC12' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serie?: string | null;

  @ApiProperty({ example: '2026-10-26' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaAsignacion!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  localId!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nivelId!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ambienteId!: number;

  @ApiPropertyOptional({ description: 'Área del equipo; si se omite se usa la de la ubicación' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  areaId?: number;

  @ApiPropertyOptional({
    description:
      'Características de esta unidad (nombre → valor). Se guardan solo las que difieren de las del catálogo.',
    example: { Procesador: 'Core i5', RAM: '16 GB' },
  })
  @IsOptional()
  @IsObject()
  caracteristicas?: Record<string, string>;
}

export class ReasignarEquipoDto {
  @ApiProperty({ description: 'ID del anexo (Trabajador) que recibe el equipo' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  anexoDestinoId!: number;

  @ApiProperty({ example: '2026-10-26' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaAsignacion!: string;

  @ApiPropertyOptional({ description: 'Nueva ubicación: local, nivel y ambiente van juntos' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  localId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nivelId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ambienteId?: number;

  @ApiPropertyOptional({ description: 'Área del equipo; si se omite se usa la de la ubicación' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  areaId?: number;
}

export class DevolverEquipoDto {
  @ApiProperty({ example: '2026-10-26' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;
}

export type TipoMovimiento = 'Asignación' | 'Reasignación' | 'Devolución';

export class MovimientoEquipoDto {
  id!: number;
  movimiento!: TipoMovimiento;
  fecha!: string;
  responsableAnterior!: string | null;
  responsableNuevo!: string | null;
  ubicacionAnterior!: string | null;
  ubicacionNueva!: string | null;
  areaAnterior!: string | null;
  areaNueva!: string | null;
}

export class EquipoAsignadoDto {
  id!: number;
  /** Código del bien en el catálogo. */
  codigo!: string;
  /** Código propio del activo fijo (AF-0001). */
  codigoActivo!: string;
  tipo!: string;
  marca!: string;
  modelo!: string;
  color!: string | null;
  serie!: string | null;
  cantidad!: number;
  estado!: EstadoEquipo;
  fechaAsignacion!: string;
  caracteristicas!: Record<string, string>;
  localId!: number;
  local!: string;
  nivelId!: number;
  nivel!: string;
  ambienteId!: number;
  ambiente!: string;
  areaId!: number | null;
  area!: string | null;
}

/** Un equipo del inventario general, con su responsable (si lo tiene). */
export class EquipoInventarioDto extends EquipoAsignadoDto {
  responsableId!: number | null;
  responsable!: string | null;
}

export class BienCatalogoDto {
  id!: number;
  codigo!: string;
  descripcion!: string;
  tipo!: string;
  /** Características estándar del bien (tabla hija del catálogo). */
  caracteristicas!: Record<string, string>;
}

export class AmbienteOpcionDto {
  id!: number;
  nombre!: string;
  /** Área por defecto de esa ubicación. */
  areaId!: number | null;
}

export class AreaOpcionDto {
  id!: number;
  nombre!: string;
}

export class NivelOpcionDto {
  id!: number;
  nombre!: string;
  ambientes!: AmbienteOpcionDto[];
}

export class LocalOpcionDto {
  id!: number;
  nombre!: string;
  niveles!: NivelOpcionDto[];
}

export class OpcionesEquipoDto {
  catalogo!: BienCatalogoDto[];
  locales!: LocalOpcionDto[];
  areas!: AreaOpcionDto[];
}
