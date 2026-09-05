import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import type { Varchar } from '@prisma/orm-postgres/target/codec-types';
import { nowInstant, toInstant, toInstantString } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import {
  CreateIncidenciaDto,
  IncidenciaResponseDto,
  ListIncidenciaQueryDto,
  UpdateIncidenciaDto,
} from './incidencia.dto.js';

type Varchar255 = Varchar<255>;
type Varchar50 = Varchar<50>;
type Varchar10 = Varchar<10>;

function toVarchar<N extends number = 255>(value: string | undefined): Varchar<N> | undefined;
function toVarchar<N extends number = 255>(value: string | null | undefined): Varchar<N> | null | undefined;
function toVarchar<N extends number = 255>(value: string | null | undefined): Varchar<N> | null | undefined {
  return value as unknown as Varchar<N>;
}

@Injectable()
export class IncidenciaHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(dto: CreateIncidenciaDto): Promise<IncidenciaResponseDto> {
    return this.db.orm.public.Incidencia.create({
      promotor: toVarchar(dto.promotor),
      docRegistrador: toVarchar(dto.docRegistrador),
      cargoRegistrador: toVarchar(dto.cargoRegistrador),
      solicitante: toVarchar(dto.solicitante),
      docSolicitante: toVarchar(dto.docSolicitante),
      telefonoSolicitante: toVarchar(dto.telefonoSolicitante),
      domicilioSolicitante: toVarchar(dto.domicilioSolicitante),
      fechaIncidencia: toInstant(dto.fechaIncidencia) ?? nowInstant(),
      horaIncidencia: toVarchar<10>(dto.horaIncidencia),
      origenIncidencia: toVarchar(dto.origenIncidencia ?? 'DIRECTO'),
      viaOrigen: toVarchar(dto.viaOrigen),
      cuadra: toVarchar(dto.cuadra),
      urbanizacion: toVarchar(dto.urbanizacion),
      sectorVecinal: toVarchar(dto.sectorVecinal),
      tipificacion: toVarchar(dto.tipificacion ?? 'INCIDENCIA TÉCNICA'),
      direccionExacta: toVarchar(dto.direccionExacta),
      incidencia: dto.incidencia,
      prioridadCategoria: toVarchar(dto.prioridadCategoria ?? 'NORMAL'),
      latitud: toVarchar<50>(dto.latitud),
      longitud: toVarchar<50>(dto.longitud),
      gerenciaAsignada: toVarchar(dto.gerenciaAsignada),
      representante: toVarchar(dto.representante),
      estado: toVarchar<50>(dto.estado ?? 'PENDIENTE'),
      accionPrevia: dto.accionPrevia ?? null,
      accionTomada: dto.accionTomada ?? null,
      aprobacion: toVarchar(dto.aprobacion),
      documentoGestrad: toVarchar(dto.documentoGestrad),
      fechaInicio: toInstant(dto.fechaInicio) ?? nowInstant(),
      fechaFin: toInstant(dto.fechaFin),
    });
  }

  async duplicate(id: number): Promise<IncidenciaResponseDto> {
    const original = await this.getById(id);
    return this.db.orm.public.Incidencia.create({
      promotor: toVarchar(original.promotor ?? undefined),
      docRegistrador: toVarchar(original.docRegistrador ?? undefined),
      cargoRegistrador: toVarchar(original.cargoRegistrador ?? undefined),
      solicitante: toVarchar(original.solicitante ?? undefined),
      docSolicitante: toVarchar(original.docSolicitante ?? undefined),
      telefonoSolicitante: toVarchar(original.telefonoSolicitante ?? undefined),
      domicilioSolicitante: toVarchar(original.domicilioSolicitante ?? undefined),
      fechaIncidencia: original.fechaIncidencia,
      horaIncidencia: toVarchar<10>(original.horaIncidencia ?? undefined),
      origenIncidencia: toVarchar(original.origenIncidencia ?? undefined),
      viaOrigen: toVarchar(original.viaOrigen ?? undefined),
      cuadra: toVarchar(original.cuadra ?? undefined),
      urbanizacion: toVarchar(original.urbanizacion ?? undefined),
      sectorVecinal: toVarchar(original.sectorVecinal ?? undefined),
      tipificacion: toVarchar(original.tipificacion ?? undefined),
      direccionExacta: toVarchar(original.direccionExacta ?? undefined),
      incidencia: `(Copia) ${original.incidencia ?? ''}`,
      prioridadCategoria: toVarchar(original.prioridadCategoria ?? undefined),
      latitud: toVarchar<50>(original.latitud ?? undefined),
      longitud: toVarchar<50>(original.longitud ?? undefined),
      gerenciaAsignada: toVarchar(original.gerenciaAsignada ?? undefined),
      representante: toVarchar(original.representante ?? undefined),
      estado: toVarchar<50>(original.estado),
      accionPrevia: original.accionPrevia ?? null,
      accionTomada: original.accionTomada ?? null,
      aprobacion: toVarchar(original.aprobacion ?? undefined),
      documentoGestrad: toVarchar(original.documentoGestrad ?? undefined),
      fechaInicio: original.fechaInicio,
      fechaFin: original.fechaFin,
    });
  }

  async list(query: ListIncidenciaQueryDto): Promise<IncidenciaResponseDto[]> {
    const fechaIni = toInstant(query.fechaInicio);
    const fechaFin = toInstant(query.fechaFin);
    const base = this.db.orm.public.Incidencia.orderBy((i) => i.id.desc());
    const collection = hasFilters(query)
      ? base.where((i) =>
          and(
            ...(query.estado ? [i.estado.ilike(query.estado)] : []),
            ...(query.promotor ? [i.promotor.ilike(`%${query.promotor}%`)] : []),
            ...(query.solicitante ? [i.solicitante.ilike(`%${query.solicitante}%`)] : []),
            ...(query.incidencia ? [i.incidencia.ilike(`%${query.incidencia}%`)] : []),
            ...(query.representante ? [i.representante.ilike(`%${query.representante}%`)] : []),
            ...(fechaIni ? [i.fechaInicio.gte(fechaIni)] : []),
            ...(fechaFin ? [i.fechaFin.lte(fechaFin)] : []),
          ),
        )
      : base;
    return collection.all();
  }

  async getById(id: number): Promise<IncidenciaResponseDto> {
    const row = await this.db.orm.public.Incidencia.first({ id });
    if (!row) throw new NotFoundException(`Incidencia con ID ${id} no encontrada`);
    return row;
  }

  async update(id: number, dto: UpdateIncidenciaDto): Promise<IncidenciaResponseDto> {
    const updateData: {
      promotor?: Varchar255;
      docRegistrador?: Varchar255;
      cargoRegistrador?: Varchar255;
      solicitante?: Varchar255;
      docSolicitante?: Varchar255;
      telefonoSolicitante?: Varchar255;
      domicilioSolicitante?: Varchar255;
      fechaIncidencia?: Temporal.Instant | null;
      horaIncidencia?: Varchar10;
      origenIncidencia?: Varchar255;
      viaOrigen?: Varchar255;
      cuadra?: Varchar255;
      urbanizacion?: Varchar255;
      sectorVecinal?: Varchar255;
      tipificacion?: Varchar255;
      direccionExacta?: Varchar255;
      incidencia?: string;
      prioridadCategoria?: Varchar255;
      latitud?: Varchar50;
      longitud?: Varchar50;
      gerenciaAsignada?: Varchar255;
      representante?: Varchar255;
      estado?: Varchar50;
      accionPrevia?: string | null;
      accionTomada?: string | null;
      aprobacion?: Varchar255;
      documentoGestrad?: Varchar255;
      fechaInicio?: Temporal.Instant;
      fechaFin?: Temporal.Instant | null;
    } = {};

    if (dto.promotor !== undefined) updateData.promotor = toVarchar(dto.promotor);
    if (dto.docRegistrador !== undefined) updateData.docRegistrador = toVarchar(dto.docRegistrador);
    if (dto.cargoRegistrador !== undefined) updateData.cargoRegistrador = toVarchar(dto.cargoRegistrador);
    if (dto.solicitante !== undefined) updateData.solicitante = toVarchar(dto.solicitante);
    if (dto.docSolicitante !== undefined) updateData.docSolicitante = toVarchar(dto.docSolicitante);
    if (dto.telefonoSolicitante !== undefined)
      updateData.telefonoSolicitante = toVarchar(dto.telefonoSolicitante);
    if (dto.domicilioSolicitante !== undefined)
      updateData.domicilioSolicitante = toVarchar(dto.domicilioSolicitante);
    if (dto.fechaIncidencia !== undefined) updateData.fechaIncidencia = toInstant(dto.fechaIncidencia);
    if (dto.horaIncidencia !== undefined) updateData.horaIncidencia = toVarchar<10>(dto.horaIncidencia);
    if (dto.origenIncidencia !== undefined) updateData.origenIncidencia = toVarchar(dto.origenIncidencia);
    if (dto.viaOrigen !== undefined) updateData.viaOrigen = toVarchar(dto.viaOrigen);
    if (dto.cuadra !== undefined) updateData.cuadra = toVarchar(dto.cuadra);
    if (dto.urbanizacion !== undefined) updateData.urbanizacion = toVarchar(dto.urbanizacion);
    if (dto.sectorVecinal !== undefined) updateData.sectorVecinal = toVarchar(dto.sectorVecinal);
    if (dto.tipificacion !== undefined) updateData.tipificacion = toVarchar(dto.tipificacion);
    if (dto.direccionExacta !== undefined) updateData.direccionExacta = toVarchar(dto.direccionExacta);
    if (dto.incidencia !== undefined) updateData.incidencia = dto.incidencia;
    if (dto.prioridadCategoria !== undefined)
      updateData.prioridadCategoria = toVarchar(dto.prioridadCategoria);
    if (dto.latitud !== undefined) updateData.latitud = toVarchar<50>(dto.latitud);
    if (dto.longitud !== undefined) updateData.longitud = toVarchar<50>(dto.longitud);
    if (dto.gerenciaAsignada !== undefined) updateData.gerenciaAsignada = toVarchar(dto.gerenciaAsignada);
    if (dto.representante !== undefined) updateData.representante = toVarchar(dto.representante);
    if (dto.estado !== undefined) updateData.estado = toVarchar<50>(dto.estado);
    if (dto.accionPrevia !== undefined) updateData.accionPrevia = dto.accionPrevia;
    if (dto.accionTomada !== undefined) updateData.accionTomada = dto.accionTomada;
    if (dto.aprobacion !== undefined) updateData.aprobacion = toVarchar(dto.aprobacion);
    if (dto.documentoGestrad !== undefined) updateData.documentoGestrad = toVarchar(dto.documentoGestrad);
    if (dto.fechaInicio !== undefined) {
      const parsedInicio = toInstant(dto.fechaInicio);
      if (parsedInicio) updateData.fechaInicio = parsedInicio;
    }
    if (dto.fechaFin !== undefined) updateData.fechaFin = toInstant(dto.fechaFin);

    const row = await this.db.orm.public.Incidencia.where({ id }).update(updateData);
    if (!row) throw new NotFoundException(`Incidencia con ID ${id} no encontrada`);
    return row;
  }

  async remove(id: number): Promise<void> {
    const row = await this.db.orm.public.Incidencia.where({ id }).delete();
    if (!row) throw new NotFoundException(`Incidencia con ID ${id} no encontrada`);
  }

  async generateExcelCsv(query: ListIncidenciaQueryDto): Promise<string> {
    const list = await this.list(query);

    const headers = [
      'ID',
      'REGISTRADOR',
      'DOC. IDENTIDAD',
      'CARGO',
      'SOLICITANTE',
      'DOC. SOLICITANTE',
      'TELÉFONO',
      'DOMICILIO',
      'FECHA',
      'ORIGEN',
      'DIRECCIÓN',
      'ESTADO',
      'INCIDENCIA',
    ];

    const rows = list.map((item) => [
      item.id,
      csvCell(item.promotor),
      csvCell(item.docRegistrador),
      csvCell(item.cargoRegistrador),
      csvCell(item.solicitante),
      csvCell(item.docSolicitante),
      csvCell(item.telefonoSolicitante),
      csvCell(item.domicilioSolicitante),
      csvCell(toInstantString(item.fechaIncidencia) || toInstantString(item.fechaInicio).substring(0, 10)),
      csvCell(item.origenIncidencia),
      csvCell(item.direccionExacta || item.domicilioSolicitante),
      csvCell(item.estado || 'PENDIENTE'),
      csvCell(item.incidencia),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

function hasFilters(query: ListIncidenciaQueryDto): boolean {
  return (
    query.estado !== undefined ||
    query.promotor !== undefined ||
    query.solicitante !== undefined ||
    query.incidencia !== undefined ||
    query.representante !== undefined ||
    query.fechaInicio !== undefined ||
    query.fechaFin !== undefined
  );
}

function csvCell(value: string | null | undefined): string {
  return `"${(value ?? '').replace(/"/g, '""')}"`;
}