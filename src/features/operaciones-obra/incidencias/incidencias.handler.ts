import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { nowInstant, toInstantString } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { assertCentroCosto, compact } from '../shared/obra-shared.js';
import type { CreateObraIncidenciaDto, ObraIncidenciaDto, UpdateObraIncidenciaDto } from './incidencias.dto.js';

type IncidenciaRow = NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_incidencias_rfi']['first']>>>;

export function mapIncidencia(i: IncidenciaRow): ObraIncidenciaDto {
  return {
    id: i.id,
    codigo_incidencia: i.codigo_incidencia ?? '',
    titulo: i.titulo ?? '',
    descripcion: i.descripcion ?? '',
    prioridad: i.prioridad ?? 'MEDIA',
    responsable: i.responsable ?? undefined,
    accion_solicitada_o_ejecutada: i.accion_solicitada_o_ejecutada ?? undefined,
    plazo_resolucion: i.plazo_resolucion ?? undefined,
    estado: i.estado ?? 'PENDIENTE',
    fecha_reporte: toInstantString(i.fecha_reporte),
    fecha_resolucion: i.fecha_resolucion ? toInstantString(i.fecha_resolucion) : undefined,
  };
}

@Injectable()
export class ObraIncidenciasHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(idCentroCosto: number): Promise<ObraIncidenciaDto[]> {
    const rows = await this.db.orm.public.obra_incidencias_rfi
      .where({ id_centro_costo: idCentroCosto })
      .orderBy((i) => i.id.desc())
      .all();
    return rows.map(mapIncidencia);
  }

  async create(idCentroCosto: number, dto: CreateObraIncidenciaDto): Promise<ObraIncidenciaDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    const existentes = await this.db.orm.public.obra_incidencias_rfi.where({ id_centro_costo: idCentroCosto }).all();
    const correlativo =
      existentes.reduce((max, i) => {
        const n = Number(/(\d+)$/.exec(i.codigo_incidencia ?? '')?.[1] ?? 0);
        return Math.max(max, n);
      }, 0) + 1;
    const codigo = `INC-${idCentroCosto}-${correlativo.toString().padStart(3, '0')}`;

    const row = await this.db.orm.public.obra_incidencias_rfi.create({
      id_centro_costo: idCentroCosto,
      codigo_incidencia: toVarchar<50>(codigo),
      titulo: toVarchar<255>(dto.titulo.trim()),
      descripcion: toVarchar<1000>(dto.descripcion.trim()),
      prioridad: toVarchar<50>(dto.prioridad ?? 'MEDIA'),
      responsable: toVarchar<150>(dto.responsable),
      accion_solicitada_o_ejecutada: toVarchar<1000>(dto.accion_solicitada_o_ejecutada),
      plazo_resolucion: toVarchar<100>(dto.plazo_resolucion),
      estado: toVarchar<50>('PENDIENTE'),
      fecha_reporte: nowInstant(),
    });
    return mapIncidencia(row);
  }

  async update(idCentroCosto: number, idIncidencia: number, dto: UpdateObraIncidenciaDto): Promise<ObraIncidenciaDto> {
    const actual = await this.findOrFail(idCentroCosto, idIncidencia);
    // Al pasar a RESUELTA se registra la fecha; si se reabre se limpia.
    let fechaResolucion: Temporal.Instant | null | undefined;
    if (dto.estado === 'RESUELTA' && actual.estado !== 'RESUELTA') fechaResolucion = nowInstant();
    else if (dto.estado && dto.estado !== 'RESUELTA' && actual.estado === 'RESUELTA') fechaResolucion = null;

    const row = await this.db.orm.public.obra_incidencias_rfi.where({ id: idIncidencia }).update(
      compact({
        titulo: toVarchar<255>(dto.titulo?.trim()),
        descripcion: toVarchar<1000>(dto.descripcion?.trim()),
        prioridad: toVarchar<50>(dto.prioridad),
        responsable: toVarchar<150>(dto.responsable),
        accion_solicitada_o_ejecutada: toVarchar<1000>(dto.accion_solicitada_o_ejecutada),
        plazo_resolucion: toVarchar<100>(dto.plazo_resolucion),
        estado: toVarchar<50>(dto.estado),
        fecha_resolucion: fechaResolucion,
      }),
    );
    if (!row) throw new NotFoundException(`Incidencia ${idIncidencia} no encontrada`);
    return mapIncidencia(row);
  }

  async remove(idCentroCosto: number, idIncidencia: number) {
    await this.findOrFail(idCentroCosto, idIncidencia);
    await this.db.orm.public.obra_incidencias_rfi.where({ id: idIncidencia }).delete();
    return { deleted: true, id: idIncidencia };
  }

  private async findOrFail(idCentroCosto: number, idIncidencia: number) {
    const row = await this.db.orm.public.obra_incidencias_rfi.first({ id: idIncidencia, id_centro_costo: idCentroCosto });
    if (!row) throw new NotFoundException(`Incidencia ${idIncidencia} no encontrada para CC ${idCentroCosto}`);
    return row;
  }
}
