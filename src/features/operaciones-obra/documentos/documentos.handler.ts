import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { toInstantString } from '../../../platform/db/temporal.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { toVarchar } from '../../presupuestos/presupuestos.helpers.js';
import { assertCentroCosto, compact, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
import type { CreateObraDocumentoDto, ObraDocumentoDto, UpdateObraDocumentoDto } from './documentos.dto.js';

type DocumentoRow = NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_documentos_actas']['first']>>>;

export function mapDocumento(d: DocumentoRow): ObraDocumentoDto {
  return {
    id: d.id,
    titulo: d.titulo ?? '',
    subtitulo: d.subtitulo ?? undefined,
    categoria: d.categoria ?? 'Otros',
    nro_registro: d.nro_registro ?? undefined,
    fecha_emision: d.fecha_emision ? readDateOnly(d.fecha_emision) : undefined,
    vigencia_texto: d.vigencia_texto ?? undefined,
    estado: d.estado ?? 'Validado',
    archivo_url: d.archivo_url ?? undefined,
    created_at: toInstantString(d.created_at),
  };
}

@Injectable()
export class DocumentosHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(idCentroCosto: number): Promise<ObraDocumentoDto[]> {
    const rows = await this.db.orm.public.obra_documentos_actas
      .where({ id_centro_costo: idCentroCosto })
      .orderBy((d) => d.id.desc())
      .all();
    return rows.map(mapDocumento);
  }

  async create(idCentroCosto: number, dto: CreateObraDocumentoDto): Promise<ObraDocumentoDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    const row = await this.db.orm.public.obra_documentos_actas.create({
      id_centro_costo: idCentroCosto,
      titulo: toVarchar<255>(dto.titulo.trim()),
      subtitulo: toVarchar<1000>(dto.subtitulo),
      categoria: toVarchar<100>(dto.categoria),
      nro_registro: toVarchar<100>(dto.nro_registro),
      fecha_emision: toDateOnly(dto.fecha_emision),
      vigencia_texto: toVarchar<100>(dto.vigencia_texto),
      estado: toVarchar<50>(dto.estado ?? 'Validado'),
      archivo_url: toVarchar<1000>(dto.archivo_url),
    });
    return mapDocumento(row);
  }

  async update(idCentroCosto: number, idDocumento: number, dto: UpdateObraDocumentoDto): Promise<ObraDocumentoDto> {
    await this.findOrFail(idCentroCosto, idDocumento);
    const row = await this.db.orm.public.obra_documentos_actas.where({ id: idDocumento }).update(
      compact({
        titulo: toVarchar<255>(dto.titulo?.trim()),
        subtitulo: toVarchar<1000>(dto.subtitulo),
        categoria: toVarchar<100>(dto.categoria),
        nro_registro: toVarchar<100>(dto.nro_registro),
        fecha_emision: toDateOnly(dto.fecha_emision),
        vigencia_texto: toVarchar<100>(dto.vigencia_texto),
        estado: toVarchar<50>(dto.estado),
        archivo_url: toVarchar<1000>(dto.archivo_url),
      }),
    );
    if (!row) throw new NotFoundException(`Documento ${idDocumento} no encontrado`);
    return mapDocumento(row);
  }

  async remove(idCentroCosto: number, idDocumento: number) {
    await this.findOrFail(idCentroCosto, idDocumento);
    await this.db.orm.public.obra_documentos_actas.where({ id: idDocumento }).delete();
    return { deleted: true, id: idDocumento };
  }

  private async findOrFail(idCentroCosto: number, idDocumento: number) {
    const row = await this.db.orm.public.obra_documentos_actas.first({ id: idDocumento, id_centro_costo: idCentroCosto });
    if (!row) throw new NotFoundException(`Documento ${idDocumento} no encontrado para CC ${idCentroCosto}`);
    return row;
  }
}
