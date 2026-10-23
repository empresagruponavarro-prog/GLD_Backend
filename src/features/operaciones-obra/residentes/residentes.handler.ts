import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { assertCentroCosto, compact, whatsappUrl } from '../shared/obra-shared.js';
import type { CreateObraResidenteDto, ObraResidenteDto, UpdateObraResidenteDto } from './residentes.dto.js';

type ResidenteRow = NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_residentes']['first']>>>;

export function mapResidente(r: ResidenteRow): ObraResidenteDto {
  return {
    id: r.id,
    id_anexo: r.id_anexo ?? undefined,
    nombre_completo: r.nombre_completo ?? '',
    rol_obra: r.rol_obra ?? '',
    especialidad: r.especialidad ?? undefined,
    telefono: r.telefono ?? undefined,
    correo: r.correo ?? undefined,
    turno: r.turno ?? undefined,
    estado_planta: r.estado_planta ?? 'En Planta',
    foto_url: r.foto_url ?? undefined,
    orden: r.orden ?? 0,
    whatsapp_url: whatsappUrl(r.telefono),
  };
}

@Injectable()
export class ResidentesHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(idCentroCosto: number): Promise<ObraResidenteDto[]> {
    const rows = await this.db.orm.public.obra_residentes
      .where({ id_centro_costo: idCentroCosto })
      .orderBy((r) => r.orden.asc())
      .all();
    return rows.map(mapResidente);
  }

  async create(idCentroCosto: number, dto: CreateObraResidenteDto): Promise<ObraResidenteDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    let orden = dto.orden;
    if (orden === undefined) {
      const actuales = await this.list(idCentroCosto);
      orden = actuales.reduce((max, r) => Math.max(max, r.orden), 0) + 1;
    }
    const row = await this.db.orm.public.obra_residentes.create({
      id_centro_costo: idCentroCosto,
      id_anexo: dto.id_anexo,
      nombre_completo: toVarchar<200>(dto.nombre_completo.trim()),
      rol_obra: toVarchar<100>(dto.rol_obra.trim()),
      especialidad: toVarchar<150>(dto.especialidad),
      telefono: toVarchar<50>(dto.telefono),
      correo: toVarchar<150>(dto.correo),
      turno: toVarchar<100>(dto.turno),
      estado_planta: toVarchar<50>(dto.estado_planta ?? 'En Planta'),
      orden,
    });
    return mapResidente(row);
  }

  async update(idCentroCosto: number, idResidente: number, dto: UpdateObraResidenteDto): Promise<ObraResidenteDto> {
    await this.findOrFail(idCentroCosto, idResidente);
    const row = await this.db.orm.public.obra_residentes.where({ id: idResidente }).update(
      compact({
        id_anexo: dto.id_anexo,
        nombre_completo: toVarchar<200>(dto.nombre_completo?.trim()),
        rol_obra: toVarchar<100>(dto.rol_obra?.trim()),
        especialidad: toVarchar<150>(dto.especialidad),
        telefono: toVarchar<50>(dto.telefono),
        correo: toVarchar<150>(dto.correo),
        turno: toVarchar<100>(dto.turno),
        estado_planta: toVarchar<50>(dto.estado_planta),
        orden: dto.orden,
      }),
    );
    if (!row) throw new NotFoundException(`Residente ${idResidente} no encontrado`);
    return mapResidente(row);
  }

  async remove(idCentroCosto: number, idResidente: number) {
    await this.findOrFail(idCentroCosto, idResidente);
    await this.db.orm.public.obra_residentes.where({ id: idResidente }).delete();
    return { deleted: true, id: idResidente };
  }

  private async findOrFail(idCentroCosto: number, idResidente: number) {
    const row = await this.db.orm.public.obra_residentes.first({ id: idResidente, id_centro_costo: idCentroCosto });
    if (!row) throw new NotFoundException(`Residente ${idResidente} no encontrado para CC ${idCentroCosto}`);
    return row;
  }
}
