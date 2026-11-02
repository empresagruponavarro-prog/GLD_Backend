import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/db/pagination.dto.js';
import { toBoolean } from '../../../platform/db/transform.js';

/**
 * Datos de un trabajador: lo que vive en Anexos (identificación y contacto personal) y su ficha de RR.HH.
 * (tipo, modalidad de contrato, área y contacto institucional). El tipo de anexo lo pone el sistema.
 */
export class CreateTrabajadorDto {
  @ApiProperty({ example: 'JUAN CARLOS PÉREZ', description: 'Nombre completo' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  Anexo: string;

  @ApiProperty({ example: 4, description: 'Tipo de documento de identidad (id)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  AnexoTipoDocIdeId: number;

  @ApiProperty({ example: '12345678', description: 'DNI: 8 dígitos; pasaporte: 6 a 12 letras o números' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  NumeroDocIde: string;

  @ApiPropertyOptional({ example: 1, description: 'Especialidad (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  AnexoEspecialidadId?: number | null;

  @ApiProperty({ example: 1, description: 'Tipo de trabajador (catálogo de RR.HH.)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idTipoTrabajador: number;

  @ApiProperty({ example: 1, description: 'Modalidad de contrato (catálogo de RR.HH.)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idModalidadContrato: number;

  @ApiPropertyOptional({ example: 7, description: 'Área de trabajo; su jefe es el jefe inmediato' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idArea?: number | null;

  @ApiPropertyOptional({ example: 'Av. Principal 123', description: 'Dirección personal' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Direccion?: string | null;

  @ApiPropertyOptional({ example: '987654321', description: 'Teléfono personal' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  Telefono?: string | null;

  @ApiPropertyOptional({ example: 'juan@gmail.com', description: 'Correo personal' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo personal no tiene un formato válido' })
  @MaxLength(255)
  Correo?: string | null;

  @ApiPropertyOptional({ example: 'Sede central, piso 2' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccionInstitucional?: string | null;

  @ApiPropertyOptional({ example: 'Anexo 214' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  telefonoInstitucional?: string | null;

  @ApiPropertyOptional({ example: 'jperez@empresa.com.pe' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo institucional no tiene un formato válido' })
  @MaxLength(255)
  correoInstitucional?: string | null;

  @ApiPropertyOptional({ default: true, description: 'false = dado de baja' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  estado?: boolean;
}

/** En la edición todo es opcional; lo que no se envía no cambia. Los obligatorios no aceptan null. */
export class UpdateTrabajadorDto extends PartialType(CreateTrabajadorDto) {}

/** Situaciones que RR.HH. tiene que ir corrigiendo. */
export const SITUACIONES = ['ficha-pendiente', 'documento-pendiente'] as const;
export type Situacion = (typeof SITUACIONES)[number];

export class ListTrabajadorQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca en el nombre y en el número de documento' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  busqueda?: string;

  @ApiPropertyOptional({ description: 'Filtro por estado (true activos, false dados de baja)' })
  @IsOptional()
  @toBoolean()
  @IsBoolean()
  estado?: boolean;

  @ApiPropertyOptional({
    enum: SITUACIONES,
    description: 'ficha-pendiente: aún sin tipo ni modalidad; documento-pendiente: sin documento o con «-»',
  })
  @IsOptional()
  @IsIn(SITUACIONES)
  situacion?: Situacion;

  @ApiPropertyOptional({ description: 'Filtro por tipo de trabajador (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idTipoTrabajador?: number;

  @ApiPropertyOptional({ description: 'Filtro por modalidad de contrato (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idModalidadContrato?: number;

  @ApiPropertyOptional({ description: 'Filtro por área de trabajo (id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  idArea?: number;
}

/** Conteos para las tarjetas de la lista (sobre todos los trabajadores, sin filtros). */
export class ResumenTrabajadoresDto {
  @ApiProperty({ example: 320 }) total: number;
  @ApiProperty({ example: 300 }) activos: number;
  @ApiProperty({ example: 20 }) deBaja: number;
  @ApiProperty({ example: 280, description: 'Trabajadores que RR.HH. aún no completó (sin ficha)' }) fichaPendiente: number;
  @ApiProperty({ example: 166, description: 'Sin número de documento o con «-»' }) documentoPendiente: number;
}

export class OpcionCatalogoDto {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: 'PLAZO INDETERMINADO' }) nombre: string;
  @ApiProperty({ example: true, description: 'Las inactivas no se ofrecen al elegir, pero se siguen mostrando' }) activo: boolean;
}

export class OpcionesTrabajadorDto {
  @ApiProperty({ type: OpcionCatalogoDto, isArray: true, description: 'Tipos de documento de identidad para trabajadores' })
  tiposDocumento: OpcionCatalogoDto[];

  @ApiProperty({ type: OpcionCatalogoDto, isArray: true })
  tiposTrabajador: OpcionCatalogoDto[];

  @ApiProperty({ type: OpcionCatalogoDto, isArray: true })
  modalidadesContrato: OpcionCatalogoDto[];
}

export class TrabajadorResponseDto {
  @ApiProperty({ example: 1 }) id: number;
  @ApiProperty({ example: 'JUAN CARLOS PÉREZ', nullable: true }) Anexo: string | null;
  @ApiProperty({ example: 4, nullable: true }) AnexoTipoDocIdeId: number | null;
  @ApiProperty({ example: '12345678', nullable: true }) NumeroDocIde: string | null;
  @ApiProperty({ example: 1, nullable: true }) AnexoEspecialidadId: number | null;
  @ApiProperty({ example: 'Av. Principal 123', nullable: true }) Direccion: string | null;
  @ApiProperty({ example: '987654321', nullable: true }) Telefono: string | null;
  @ApiProperty({ example: 'juan@gmail.com', nullable: true }) Correo: string | null;
  @ApiProperty({ example: true }) estado: boolean;
  @ApiProperty({ example: true, description: 'false = trabajador antiguo que RR.HH. aún no completó' }) conFicha: boolean;
  @ApiProperty({ example: 1, nullable: true }) idTipoTrabajador: number | null;
  @ApiProperty({ example: 'EMPLEADO', nullable: true }) tipoTrabajador: string | null;
  @ApiProperty({ example: 1, nullable: true }) idModalidadContrato: number | null;
  @ApiProperty({ example: 'PLAZO INDETERMINADO', nullable: true }) modalidadContrato: string | null;
  @ApiProperty({ example: 7, nullable: true }) idArea: number | null;
  @ApiProperty({ example: 'Jefatura de Sistemas', nullable: true }) area: string | null;
  @ApiProperty({ example: 'Sede central', nullable: true }) direccionInstitucional: string | null;
  @ApiProperty({ example: 'Anexo 214', nullable: true }) telefonoInstitucional: string | null;
  @ApiProperty({ example: 'jperez@empresa.com.pe', nullable: true }) correoInstitucional: string | null;
}
