import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export type EstadoEquipo = 'Operativo' | 'No operativo' | 'En reparación';

export const ESTADOS_ACTIVO = ['OPERATIVO', 'NO_OPERATIVO', 'EN_REPARACION'] as const;
export type EstadoActivo = (typeof ESTADOS_ACTIVO)[number];

/** Cambia el estado de un equipo (operativo, no operativo o en reparación). */
export class CambiarEstadoDto {
  @ApiProperty({ enum: ESTADOS_ACTIVO, example: 'EN_REPARACION' })
  @IsIn(ESTADOS_ACTIVO)
  estado!: EstadoActivo;
}

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

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  localId?: number;

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nivelId?: number;

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
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

  @ApiPropertyOptional({ enum: ['EMPRESA', 'CENTRO_COSTO'], description: 'A qué se asigna el equipo; va con destinoId' })
  @IsOptional()
  @IsIn(['EMPRESA', 'CENTRO_COSTO'])
  destinoTipo?: 'EMPRESA' | 'CENTRO_COSTO';

  @ApiPropertyOptional({ description: 'ID de la empresa o del centro de costo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinoId?: number;

  @ApiPropertyOptional({
    description:
      'Características de esta unidad (nombre → valor). Se guardan solo las que difieren de las del catálogo.',
    example: { Procesador: 'Core i5', RAM: '16 GB' },
  })
  @IsOptional()
  @IsObject()
  caracteristicas?: Record<string, string>;
}

/** Registro de un activo en el inventario; el trabajador es opcional (queda disponible si se omite). */
export class RegistrarActivoDto {
  @ApiProperty({ example: 'Laptop01', description: 'Código del bien (catálogo, clase Activo Fijo)' })
  @IsString()
  @MaxLength(50)
  codigoBien!: string;

  @ApiPropertyOptional({ example: 'PF4ABC12' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  serie?: string | null;

  @ApiPropertyOptional({ enum: ESTADOS_ACTIVO, default: 'OPERATIVO', description: 'Estado del equipo al registrarlo' })
  @IsOptional()
  @IsIn(ESTADOS_ACTIVO)
  estado?: EstadoActivo;

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  localId?: number;

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nivelId?: number;

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
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

  @ApiPropertyOptional({ enum: ['EMPRESA', 'CENTRO_COSTO'], description: 'A qué se asigna el equipo; va con destinoId' })
  @IsOptional()
  @IsIn(['EMPRESA', 'CENTRO_COSTO'])
  destinoTipo?: 'EMPRESA' | 'CENTRO_COSTO';

  @ApiPropertyOptional({ description: 'ID de la empresa o del centro de costo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinoId?: number;

  @ApiPropertyOptional({ description: 'Características de esta unidad; se guardan solo las que difieren del catálogo' })
  @IsOptional()
  @IsObject()
  caracteristicas?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Trabajador que lo recibe; si se omite el equipo queda disponible' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  anexoId?: number;

  @ApiPropertyOptional({ example: '2026-10-27', description: 'Obligatoria si se indica el trabajador' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaAsignacion?: string;
}

/** Asigna a un trabajador un equipo que está disponible (sin responsable). */
export class AsignarActivoDto {
  @ApiProperty({ description: 'ID del anexo (Trabajador) que lo recibe' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  anexoId!: number;

  @ApiProperty({ example: '2026-10-27' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaAsignacion!: string;
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

  @ApiPropertyOptional({ enum: ['EMPRESA', 'CENTRO_COSTO'], description: 'A qué se asigna el equipo; va con destinoId' })
  @IsOptional()
  @IsIn(['EMPRESA', 'CENTRO_COSTO'])
  destinoTipo?: 'EMPRESA' | 'CENTRO_COSTO';

  @ApiPropertyOptional({ description: 'ID de la empresa o del centro de costo' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinoId?: number;
}

export class DevolverEquipoDto {
  @ApiProperty({ example: '2026-10-26' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;
}

/** Cambia al equipo de empresa / centro de costo, ambiente o área, con o sin responsable. */
export class MoverEquipoDto {
  @ApiProperty({ example: '2026-10-28' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fecha!: string;

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  localId?: number;

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nivelId?: number;

  @ApiPropertyOptional({ description: 'Obligatorio si el destino es una empresa' })
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

  @ApiProperty({ enum: ['EMPRESA', 'CENTRO_COSTO'], description: 'A qué va el equipo; con destinoId' })
  @IsIn(['EMPRESA', 'CENTRO_COSTO'])
  destinoTipo!: 'EMPRESA' | 'CENTRO_COSTO';

  @ApiProperty({ description: 'ID de la empresa o del centro de costo' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  destinoId!: number;
}

export type TipoMovimiento = 'Asignación' | 'Reasignación' | 'Devolución' | 'Traslado';

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
  destinoAnterior!: string | null;
  destinoNuevo!: string | null;
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
  /** A qué pertenece el local: la obra / centro de costo o la empresa (sede). */
  destino!: string | null;
  destinoTipo!: 'EMPRESA' | 'CENTRO_COSTO' | null;
  destinoId!: number | null;
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
  /** Obra / centro de costo o empresa a la que pertenece el local. */
  destino!: string | null;
  destinoTipo!: 'EMPRESA' | 'CENTRO_COSTO' | null;
  destinoId!: number | null;
  niveles!: NivelOpcionDto[];
}

export class OpcionDestinoDto {
  id!: number;
  nombre!: string;
}

export class OpcionesEquipoDto {
  catalogo!: BienCatalogoDto[];
  locales!: LocalOpcionDto[];
  areas!: AreaOpcionDto[];
  /** Empresas a las que se puede asignar un equipo. */
  empresas!: OpcionDestinoDto[];
  /** Centros de costo (obras) a los que se puede asignar un equipo; no incluye los cerrados. */
  centrosCosto!: OpcionDestinoDto[];
}
