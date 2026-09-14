import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCentroCostoDto {
  @ApiPropertyOptional({ example: 2026, description: 'Periodo fiscal' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  periodo?: number;

  @ApiPropertyOptional({ example: 'CLI-001', description: 'Código del cliente' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  CodCliente?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID del centro de costo principal' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  id_centro_costos_principal?: number;

  @ApiProperty({ example: 'PROYECTO EDIFICIO MULTIFAMILIAR', description: 'Nombre del centro de costo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  CentroCosto: string;

  @ApiPropertyOptional({ example: 'ABIERTO', description: 'Estado operativo (ABIERTO, CERRADO)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  Estado?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Fecha de inicio' })
  @IsOptional()
  @IsString()
  FechaIncio?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Fecha de fin programada' })
  @IsOptional()
  @IsString()
  FechaFinProg?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Fecha de fin real' })
  @IsOptional()
  @IsString()
  FechaFinReal?: string;

  @ApiPropertyOptional({ example: 'Aprobado', description: 'Estado del presupuesto asignado' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  PresupuestoEstado?: string;

  @ApiPropertyOptional({ example: 100000.00, description: 'Costo directo presupuestado' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PresupuestoCostoDirecto?: number;

  @ApiPropertyOptional({ example: 10000.00, description: 'Gastos generales presupuestados' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PresupuestoGastosGenerales?: number;

  @ApiPropertyOptional({ example: 5000.00, description: 'Viáticos presupuestados' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PresupuestoViaticos?: number;

  @ApiPropertyOptional({ example: 1450000.00, description: 'Monto total presupuestado' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  PresupuestoMonto?: number;

  @ApiPropertyOptional({ example: 'OC-12345.pdf', description: 'Archivo de orden de compra' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  OCFile?: string;
}

export class UpdateCentroCostoDto extends PartialType(CreateCentroCostoDto) {}

export class ListCentroCostoQueryDto {
  @ApiPropertyOptional({ description: 'Búsqueda general por texto libre' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtro por estado del centro de costos', example: 'ABIERTO' })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional({ description: 'Filtro por nombre o código de empresa', example: 'GLD' })
  @IsOptional()
  @IsString()
  empresa?: string;

  @ApiPropertyOptional({ description: 'Filtro por periodo fiscal', example: '2026' })
  @IsOptional()
  @IsString()
  periodo?: string;

  @ApiPropertyOptional({ description: 'Filtro por cliente o código de anexo' })
  @IsOptional()
  @IsString()
  cliente?: string;

  @ApiPropertyOptional({ description: 'Filtro por nombre del centro de costo' })
  @IsOptional()
  @IsString()
  centroCosto?: string;

  @ApiPropertyOptional({ description: 'Filtro por estado del presupuesto', example: 'Aprobado' })
  @IsOptional()
  @IsString()
  pptoEstado?: string;
}

export class CentroCostoResponseDto {
  @ApiPropertyOptional({ example: 1 })
  id?: number;

  @ApiPropertyOptional({ example: 1, description: 'ID del centro de costo principal' })
  @IsOptional()
  idCentroCostosPrincipal?: number | null;

  @ApiPropertyOptional({ example: 'OFICINA PRINCIPAL GLD', description: 'Nombre del centro de costo principal' })
  @IsOptional()
  CentroCostoPrincipal?: string | null;

  @ApiProperty({ example: 'Proyecto Edificio GLD', description: 'Nombre o descripción del centro de costo' })
  CentroCosto: string | null;

  @ApiProperty({ example: 'ABIERTO', description: 'Estado operativo del centro de costos' })
  Estado: string | null;

  @ApiPropertyOptional({ example: 1, description: 'Identificador de la empresa' })
  id_empresa: number | null;

  @ApiPropertyOptional({ example: 'GLD SERVICIOS GENERALES EIRL', description: 'Razón social de la empresa' })
  Empresa?: string | null;

  @ApiPropertyOptional({ example: 2026, description: 'Periodo fiscal' })
  periodo: number | null;

  @ApiPropertyOptional({ example: 'CLI-001', description: 'Código del cliente' })
  CodCliente: string | null;

  @ApiPropertyOptional({ example: 'CLIENTE SA', description: 'Nombre o razón social del cliente' })
  Cliente?: string | null;

  @ApiPropertyOptional({ example: 'Aprobado', description: 'Estado del presupuesto asignado' })
  PresupuestoEstado: string | null;

  @ApiPropertyOptional({ example: '1450000.00', description: 'Monto presupuestado' })
  PresupuestoMonto: string | null;

  @ApiPropertyOptional({ example: '2026-01-01' })
  FechaIncio?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31' })
  FechaFinProg?: string | null;

  @ApiPropertyOptional({ example: '2026-12-31' })
  FechaFinReal?: string | null;
}

export type CentroCostoRow = CentroCostoResponseDto;

export class CentroCostoMetricasResponseDto {
  @ApiProperty({ example: 934, description: 'Total de centros de costos' })
  total: number;

  @ApiProperty({ example: 483, description: 'Cantidad de centros de costos abiertos' })
  abiertos: number;

  @ApiProperty({ example: 451, description: 'Cantidad de centros de costos cerrados' })
  cerrados: number;
}

export type CentroCostoMetricas = CentroCostoMetricasResponseDto;

export class CentroCostoResumenResponseDto {
  @ApiProperty({ example: 1, description: 'ID del centro de costos' })
  id: number;

  @ApiProperty({ example: 1200000, description: 'Presupuesto base calculado' })
  presupuestoBase: number;

  @ApiProperty({ example: 1450000, description: 'Presupuesto comercial total' })
  presupuestoComercial: number;

  @ApiProperty({ example: 820000, description: 'Gastos totales acumulados' })
  gastosAcumulados: number;

  @ApiProperty({ example: 650000, description: 'Pagos totales realizados' })
  pagosRealizados: number;

  @ApiProperty({ example: 630000, description: 'Saldo actual disponible' })
  saldoActual: number;

  @ApiProperty({ example: 56.55, description: 'Porcentaje de ejecución del presupuesto' })
  porcentajeEjecucion: number;

  @ApiProperty({ example: 574000, description: 'Gastos por facturas / documentos de compra' })
  gastosFacturas: number;

  @ApiProperty({ example: 246000, description: 'Gastos por caja chica' })
  gastosCajaChica: number;

  @ApiProperty({ example: 260000, description: 'Pagos realizados en planillas' })
  pagosPlanillas: number;
}

export type CentroCostoResumen = CentroCostoResumenResponseDto;

export class CatalogosFiltrosResponseDto {
  @ApiProperty({ type: [String], description: 'Listado de empresas disponibles' })
  empresas: string[];

  @ApiProperty({ type: [Number], description: 'Listado de periodos fiscales disponibles' })
  periodos: number[];

  @ApiProperty({ type: [String], description: 'Listado de clientes disponibles' })
  clientes: string[];

  @ApiProperty({ type: [String], description: 'Listado de estados de centros de costos' })
  estados: string[];

  @ApiProperty({ type: [String], description: 'Listado de estados de presupuesto' })
  pptoEstados: string[];
}
