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
}
