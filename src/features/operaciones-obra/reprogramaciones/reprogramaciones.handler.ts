import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { aDia, deDia } from '../shared/control-avance/calendario.js';
import { cargarObra, type ObraCargada } from '../shared/control-avance/carga-obra.js';
import type { MotivoReprogramacion } from '../shared/control-avance/control-avance.types.js';
import { registrarEvento } from '../shared/control-avance/registrar-evento.js';
import { assertCentroCosto, esFechaIso, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
import type { CreateReprogramacionDto, ObraReprogramacionDto, UpdateReprogramacionDto } from './reprogramaciones.dto.js';

type Fila = NonNullable<Awaited<ReturnType<Database['orm']['public']['obra_reprogramacion']['first']>>>;

export function mapReprogramacion(r: Fila): ObraReprogramacionDto {
  return {
    id: r.id,
    desde: readDateOnly(r.desde),
    dias: r.dias,
    motivo: r.motivo,
    detalle: r.detalle ?? null,
    es_atraso: r.motivo === 'INTERNO',
    registrado_por: r.registrado_por ?? null,
  };
}

@Injectable()
export class ReprogramacionesHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listar(idCentroCosto: number): Promise<ObraReprogramacionDto[]> {
    await assertCentroCosto(this.db, idCentroCosto);
    const filas = await this.db.orm.public.obra_reprogramacion.where({ id_centro_costo: idCentroCosto }).all();
    return filas.map(mapReprogramacion).sort((a, b) => a.desde.localeCompare(b.desde) || a.id - b.id);
  }

  async crear(idCentroCosto: number, dto: CreateReprogramacionDto, usuario: string): Promise<ObraReprogramacionDto> {
    const carga = await cargarObra(this.db.orm.public, idCentroCosto);
    this.validar(carga, dto.desde);
    const antes = await this.finVigente(carga);

    let creada!: Fila;
    await this.db.transaction(async (tx) => {
      creada = await tx.orm.public.obra_reprogramacion.create({
        id_centro_costo: idCentroCosto,
        desde: toDateOnly(dto.desde)!,
        dias: dto.dias,
        motivo: dto.motivo as MotivoReprogramacion,
        detalle: toVarchar<160>(dto.detalle?.trim() || null),
        registrado_por: toVarchar<255>(usuario),
      });
      await this.evento(tx.orm.public, idCentroCosto, 'registrada', creada, antes, antes === null ? null : antes + dto.dias, usuario);
    });
    return mapReprogramacion(creada);
  }

  async editar(idCentroCosto: number, id: number, dto: UpdateReprogramacionDto, usuario: string): Promise<ObraReprogramacionDto> {
    const actual = await this.buscar(idCentroCosto, id);
    const carga = await cargarObra(this.db.orm.public, idCentroCosto);
    const desde = dto.desde ?? readDateOnly(actual.desde);
    this.validar(carga, desde);
    const antes = await this.finVigente(carga);
    const dias = dto.dias ?? actual.dias;

    let nueva!: Fila;
    await this.db.transaction(async (tx) => {
      const fila = await tx.orm.public.obra_reprogramacion.where({ id }).update({
        desde: toDateOnly(desde)!,
        dias,
        motivo: (dto.motivo ?? actual.motivo) as MotivoReprogramacion,
        ...(dto.detalle === undefined ? {} : { detalle: toVarchar<160>(dto.detalle?.trim() || null) }),
      });
      if (!fila) throw new NotFoundException(`Reprogramación ${id} no encontrada`);
      nueva = fila;
      await this.evento(tx.orm.public, idCentroCosto, 'modificada', nueva, antes, antes === null ? null : antes - actual.dias + dias, usuario);
    });
    return mapReprogramacion(nueva);
  }

  async eliminar(idCentroCosto: number, id: number, usuario: string) {
    const actual = await this.buscar(idCentroCosto, id);
    const carga = await cargarObra(this.db.orm.public, idCentroCosto);
    const antes = await this.finVigente(carga);
    await this.db.transaction(async (tx) => {
      await tx.orm.public.obra_reprogramacion.where({ id }).delete();
      await this.evento(tx.orm.public, idCentroCosto, 'eliminada', actual, antes, antes === null ? null : antes - actual.dias, usuario);
    });
    return { deleted: true, id };
  }

  // ─── Auxiliares ────────────────────────────────────────────────────────────
  /** RV-23: fecha válida y no anterior al inicio de la obra. */
  private validar(carga: ObraCargada, desde: string): void {
    if (!esFechaIso(desde)) throw new BadRequestException(`Fecha «Desde» inválida: ${desde}`);
    if (!carga.inicio) throw new BadRequestException('Defina el inicio de la obra antes de registrar una reprogramación');
    if (desde < carga.inicio) throw new BadRequestException('La reprogramación no puede empezar antes del inicio de la obra');
  }

  /** Fin vigente actual (día), o `null` si la obra aún no tiene fin definido. */
  private async finVigente(carga: ObraCargada): Promise<number | null> {
    if (!carga.fin) return null;
    const filas = await this.db.orm.public.obra_reprogramacion.where({ id_centro_costo: carga.idCentroCosto }).all();
    return aDia(carga.fin) + filas.reduce((a, r) => a + r.dias, 0);
  }

  private async buscar(idCentroCosto: number, id: number): Promise<Fila> {
    const fila = await this.db.orm.public.obra_reprogramacion.first({ id, id_centro_costo: idCentroCosto });
    if (!fila) throw new NotFoundException(`Reprogramación ${id} no encontrada para CC ${idCentroCosto}`);
    return fila;
  }

  private evento(
    orm: Parameters<typeof registrarEvento>[0],
    idCentroCosto: number,
    verbo: string,
    r: Fila,
    antes: number | null,
    despues: number | null,
    usuario: string,
  ) {
    const interna = r.motivo === 'INTERNO';
    return registrarEvento(orm, {
      idCentroCosto,
      tipo: 'REPROGRAMACION',
      titulo: `Reprogramación ${verbo}: +${r.dias} días (${r.motivo})`,
      detalle: `Desde ${readDateOnly(r.desde)}${r.detalle ? ` · ${r.detalle}` : ''}${interna ? ' · causa interna: cuenta como atraso' : ' · causa externa: no es atraso'}`,
      antes: antes === null ? null : `Fin vigente ${deDia(antes)}`,
      despues: despues === null ? null : `Fin vigente ${deDia(despues)}`,
      severidad: interna ? 'warn' : 'info',
      usuario,
    });
  }
}
