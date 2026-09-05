import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateIncidenciaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promotor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docRegistrador?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cargoRegistrador?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  solicitante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docSolicitante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefonoSolicitante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  domicilioSolicitante?: string;

  @ApiPropertyOptional({ example: '2026-09-05' })
  @IsOptional()
  @IsString()
  fechaIncidencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  horaIncidencia?: string;

  @ApiPropertyOptional({ default: 'DIRECTO' })
  @IsOptional()
  @IsString()
  origenIncidencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  viaOrigen?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cuadra?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  urbanizacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectorVecinal?: string;

  @ApiPropertyOptional({ default: 'INCIDENCIA TÉCNICA' })
  @IsOptional()
  @IsString()
  tipificacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  direccionExacta?: string;

  @ApiProperty({ description: 'Descripción de la incidencia' })
  @IsString()
  @IsNotEmpty()
  incidencia: string;

  @ApiPropertyOptional({ default: 'NORMAL' })
  @IsOptional()
  @IsString()
  prioridadCategoria?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  latitud?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  longitud?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gerenciaAsignada?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representante?: string;

  @ApiPropertyOptional({ default: 'PENDIENTE' })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accionPrevia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accionTomada?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aprobacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentoGestrad?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaInicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaFin?: string;
}

export class UpdateIncidenciaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promotor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docRegistrador?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cargoRegistrador?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  solicitante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  docSolicitante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telefonoSolicitante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  domicilioSolicitante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaIncidencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  horaIncidencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  origenIncidencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  viaOrigen?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cuadra?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  urbanizacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectorVecinal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tipificacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  direccionExacta?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incidencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prioridadCategoria?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  latitud?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  longitud?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gerenciaAsignada?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accionPrevia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accionTomada?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aprobacion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentoGestrad?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaInicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaFin?: string;
}

export class ListIncidenciaQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promotor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  solicitante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incidencia?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  representante?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaInicio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fechaFin?: string;
}

export class IncidenciaResponseDto {
  @ApiProperty({ example: 1, description: 'Identificador único de la incidencia' })
  id: number;

  @ApiPropertyOptional({ example: 'Admin', description: 'Nombre del promotor o registrador' })
  promotor: string | null;

  @ApiPropertyOptional({ example: 'DNI-12345678', description: 'Documento del registrador' })
  docRegistrador: string | null;

  @ApiPropertyOptional({ example: 'Supervisor', description: 'Cargo del registrador' })
  cargoRegistrador: string | null;

  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Nombre del solicitante / vecino' })
  solicitante: string | null;

  @ApiPropertyOptional({ example: 'DNI-87654321', description: 'Documento del solicitante' })
  docSolicitante: string | null;

  @ApiPropertyOptional({ example: '987654321', description: 'Teléfono del solicitante' })
  telefonoSolicitante: string | null;

  @ApiPropertyOptional({ example: 'Av. Principal 123', description: 'Domicilio del solicitante' })
  domicilioSolicitante: string | null;

  @ApiPropertyOptional({ description: 'Fecha y hora de ocurrencia de la incidencia' })
  fechaIncidencia: Temporal.Instant | null;

  @ApiPropertyOptional({ example: '10:30', description: 'Hora de la incidencia' })
  horaIncidencia: string | null;

  @ApiPropertyOptional({ example: 'DIRECTO', description: 'Canal de origen de la incidencia' })
  origenIncidencia: string | null;

  @ApiPropertyOptional({ example: 'Calle', description: 'Tipo de vía de origen' })
  viaOrigen: string | null;

  @ApiPropertyOptional({ example: '4', description: 'Número de cuadra' })
  cuadra: string | null;

  @ApiPropertyOptional({ example: 'Las Flores', description: 'Urbanización' })
  urbanizacion: string | null;

  @ApiPropertyOptional({ example: 'Sector 1', description: 'Sector vecinal' })
  sectorVecinal: string | null;

  @ApiPropertyOptional({ example: 'INCIDENCIA TÉCNICA', description: 'Tipificación de la incidencia' })
  tipificacion: string | null;

  @ApiPropertyOptional({ example: 'Calle 5 #120', description: 'Dirección exacta del hecho' })
  direccionExacta: string | null;

  @ApiProperty({ example: 'Fuga de agua en vereda', description: 'Descripción del incidente' })
  incidencia: string | null;

  @ApiPropertyOptional({ example: 'NORMAL', description: 'Nivel de prioridad' })
  prioridadCategoria: string | null;

  @ApiPropertyOptional({ example: '-12.04318', description: 'Coordenada de latitud' })
  latitud: string | null;

  @ApiPropertyOptional({ example: '-77.02824', description: 'Coordenada de longitud' })
  longitud: string | null;

  @ApiPropertyOptional({ example: 'Gerencia de Obras', description: 'Gerencia asignada' })
  gerenciaAsignada: string | null;

  @ApiPropertyOptional({ example: 'Ing. Carlos Gómez', description: 'Representante a cargo' })
  representante: string | null;

  @ApiProperty({ example: 'PENDIENTE', description: 'Estado actual de atención' })
  estado: string;

  @ApiPropertyOptional({ description: 'Acción previa ejecutada' })
  accionPrevia: string | null;

  @ApiPropertyOptional({ description: 'Acción tomada definitiva' })
  accionTomada: string | null;

  @ApiPropertyOptional({ description: 'Aprobación del informe' })
  aprobacion: string | null;

  @ApiPropertyOptional({ description: 'Número de documento en Gestrad' })
  documentoGestrad: string | null;

  @ApiProperty({ description: 'Fecha y hora de inicio de registro' })
  fechaInicio: Temporal.Instant;

  @ApiPropertyOptional({ description: 'Fecha y hora de cierre' })
  fechaFin: Temporal.Instant | null;

  @ApiProperty({ description: 'Fecha y hora de creación' })
  fechaCreacion: Temporal.Instant;
}

export type IncidenciaRow = IncidenciaResponseDto;