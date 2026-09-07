import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar, type Varchar255 } from '../presupuestos.helpers.js';
import {
  CreatePptoHistorialDto,
  ListPptoHistorialQueryDto,
  PptoHistorialResponseDto,
  UpdatePptoHistorialDto,
} from './presupuesto-historial.dto.js';

@Injectable()
export class PresupuestoHistorialHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(query: ListPptoHistorialQueryDto): Promise<Paginated<PptoHistorialResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const base = this.db.orm.public.ppto_Principal_Historial.orderBy((h) => h.id.desc());
    const collection = query.IdPresupuesto
      ? base.where((h) => h.IdPresupuesto.eq(toVarchar(query.IdPresupuesto!)))
      : base;

    const [total, data] = await Promise.all([
      collection.aggregate((agg) => ({ total: agg.count() })),
      collection.limit(pageSize).offset(offset).all(),
    ]);

    return toPaginated(data as PptoHistorialResponseDto[], total.total, page, pageSize);
  }

  async getById(idOrCode: string | number): Promise<PptoHistorialResponseDto> {
    const numId = Number(idOrCode);
    const row = isNaN(numId)
      ? await this.db.orm.public.ppto_Principal_Historial.first({ IdPresupuestoVersion: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_Principal_Historial.first({ id: numId });
    if (!row) throw new NotFoundException(`Historial de versión "${idOrCode}" no encontrado`);
    return row as PptoHistorialResponseDto;
  }

  async create(dto: CreatePptoHistorialDto): Promise<PptoHistorialResponseDto> {
    const created = await this.db.orm.public.ppto_Principal_Historial.create({
      IdPresupuesto: toVarchar(dto.IdPresupuesto),
      IdPresupuestoVersion: toVarchar(dto.IdPresupuestoVersion),
      NumVersion: toVarchar(dto.NumVersion),
      FilePpto: toVarchar(dto.FilePpto),
      FileCorreo: toVarchar(dto.FileCorreo),
    });
    return created as PptoHistorialResponseDto;
  }

  async update(idOrCode: string | number, dto: UpdatePptoHistorialDto): Promise<PptoHistorialResponseDto> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_Principal_Historial.first({ IdPresupuestoVersion: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_Principal_Historial.first({ id: numId });
    if (!current) throw new NotFoundException(`Historial de versión "${idOrCode}" no encontrado`);
    const id = current.id;
    const data: {
      IdPresupuesto?: Varchar255;
      IdPresupuestoVersion?: Varchar255;
      NumVersion?: Varchar255;
      FilePpto?: Varchar255;
      FileCorreo?: Varchar255;
    } = {};
    if (dto.IdPresupuesto !== undefined) data.IdPresupuesto = toVarchar(dto.IdPresupuesto);
    if (dto.IdPresupuestoVersion !== undefined) data.IdPresupuestoVersion = toVarchar(dto.IdPresupuestoVersion);
    if (dto.NumVersion !== undefined) data.NumVersion = toVarchar(dto.NumVersion);
    if (dto.FilePpto !== undefined) data.FilePpto = toVarchar(dto.FilePpto);
    if (dto.FileCorreo !== undefined) data.FileCorreo = toVarchar(dto.FileCorreo);

    const row = await this.db.orm.public.ppto_Principal_Historial.where({ id }).update(data);
    if (!row) throw new NotFoundException(`Historial ${id} no encontrado`);
    return row as PptoHistorialResponseDto;
  }

  async remove(idOrCode: string | number): Promise<{ deleted: boolean; id: number; code: string | null }> {
    const numId = Number(idOrCode);
    const current = isNaN(numId)
      ? await this.db.orm.public.ppto_Principal_Historial.first({ IdPresupuestoVersion: toVarchar(String(idOrCode)) })
      : await this.db.orm.public.ppto_Principal_Historial.first({ id: numId });
    if (!current) throw new NotFoundException(`Historial de versión "${idOrCode}" no encontrado`);
    await this.db.orm.public.ppto_Principal_Historial.where({ id: current.id }).delete();
    return { deleted: true, id: current.id, code: current.IdPresupuestoVersion };
  }
}
