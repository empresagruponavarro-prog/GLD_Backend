import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { throwIfUniqueViolation } from '../../../platform/db/pg-errors.js';
import { nowInstant } from '../../../platform/db/temporal.js';
import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { SEMANAS_META } from '../shared/control-avance/control-avance.types.js';
import type { OrmObra } from '../shared/control-avance/orm.js';
import { assertCentroCosto, compact, esFechaIso, readDateOnly, toDateOnly } from '../shared/obra-shared.js';
import type {
  CreatePartidaDto,
  CreateSubpartidaDto,
  ObraPartidaDto,
  ObraSubpartidaDto,
  UpdateMetasDto,
  UpdatePartidaDto,
  UpdateSubpartidaDto,
} from './partidas.dto.js';

type Tipo = 'CONTRACTUAL' | 'ADICIONAL';

const MSG_ITEM_PARTIDA = 'Ya existe una partida con ese ítem en esta obra';
const MSG_ITEM_SUB = 'Ya existe una subpartida con ese ítem en esta obra';

/** Estructura completa (partidas › subpartidas) de una obra, con las metas escritas a mano. */
export async function estructuraObra(orm: OrmObra, idCentroCosto: number): Promise<ObraPartidaDto[]> {
  const [partidas, subs] = await Promise.all([
    orm.obra_partida.where({ id_centro_costo: idCentroCosto }).all(),
    orm.obra_subpartida.where({ id_centro_costo: idCentroCosto }).all(),
  ]);
  const ids = subs.map((s) => s.id);
  const semanas = ids.length ? await orm.obra_subpartida_semana.where((s) => s.id_subpartida.in(ids)).all() : [];

  const metas = new Map<number, (number | null)[]>();
  const conAvance = new Set<number>();
  for (const w of semanas) {
    if (w.avance != null) conAvance.add(w.id_subpartida);
    if (w.meta != null && w.numero_semana >= 1 && w.numero_semana <= SEMANAS_META) {
      const m = metas.get(w.id_subpartida) ?? Array<number | null>(SEMANAS_META).fill(null);
      m[w.numero_semana - 1] = Number(w.meta);
      metas.set(w.id_subpartida, m);
    }
  }

  const porOrden = <T extends { orden: number | null; id: number }>(a: T, b: T) => (a.orden ?? 0) - (b.orden ?? 0) || a.id - b.id;
  return [...partidas].sort(porOrden).map((p) => ({
    id: p.id,
    item: p.item,
    nombre: p.nombre,
    tipo: p.tipo,
    orden: p.orden,
    id_ppto_detalle_fase: p.id_ppto_detalle_fase ?? null,
    subpartidas: subs
      .filter((s) => s.id_partida === p.id)
      .sort(porOrden)
      .map(
        (s): ObraSubpartidaDto => ({
          id: s.id,
          id_partida: s.id_partida,
          item: s.item,
          nombre: s.nombre,
          tipo: s.tipo ?? p.tipo,
          tipo_propio: s.tipo ?? null,
          fecha_inicio: readDateOnly(s.fecha_inicio),
          fecha_fin: readDateOnly(s.fecha_fin),
          orden: s.orden,
          observacion: s.observacion ?? null,
          id_ppto_detalle_categoria: s.id_ppto_detalle_categoria ?? null,
          metas_manuales: metas.get(s.id) ?? Array<number | null>(SEMANAS_META).fill(null),
          tiene_avance: conAvance.has(s.id),
        }),
      ),
  }));
}

/** Cantidad de subpartidas con avance registrado entre las dadas (para impedir borrar datos). */
export async function subpartidasConAvance(orm: OrmObra, idsSubpartida: number[]): Promise<number> {
  if (idsSubpartida.length === 0) return 0;
  const filas = await orm.obra_subpartida_semana.where((s) => s.id_subpartida.in(idsSubpartida)).all();
  return new Set(filas.filter((f) => f.avance != null).map((f) => f.id_subpartida)).size;
}

function validarFechas(inicio: string, fin: string): void {
  if (!esFechaIso(inicio)) throw new BadRequestException(`Fecha de inicio inválida: ${inicio}`);
  if (!esFechaIso(fin)) throw new BadRequestException(`Fecha de fin inválida: ${fin}`);
  if (fin < inicio) throw new BadRequestException('El fin programado no puede ser anterior al inicio (RV-06)');
}

@Injectable()
export class PartidasHandler {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listar(idCentroCosto: number): Promise<ObraPartidaDto[]> {
    await assertCentroCosto(this.db, idCentroCosto);
    return estructuraObra(this.db.orm.public, idCentroCosto);
  }

  // ─── Partidas ──────────────────────────────────────────────────────────────
  async crearPartida(idCentroCosto: number, dto: CreatePartidaDto): Promise<ObraPartidaDto> {
    await assertCentroCosto(this.db, idCentroCosto);
    const existentes = await this.db.orm.public.obra_partida.where({ id_centro_costo: idCentroCosto }).all();
    const orden = existentes.reduce((m, p) => Math.max(m, p.orden), 0) + 1;
    try {
      const row = await this.db.orm.public.obra_partida.create({
        id_centro_costo: idCentroCosto,
        item: toVarchar<20>(dto.item.trim()),
        nombre: toVarchar<150>(dto.nombre.trim()),
        tipo: (dto.tipo ?? 'CONTRACTUAL') as Tipo,
        orden,
      });
      return this.partida(idCentroCosto, row.id);
    } catch (e) {
      throwIfUniqueViolation(e, MSG_ITEM_PARTIDA);
      throw e;
    }
  }

  async editarPartida(idCentroCosto: number, idPartida: number, dto: UpdatePartidaDto): Promise<ObraPartidaDto> {
    await this.partidaOFalla(idCentroCosto, idPartida);
    try {
      await this.db.orm.public.obra_partida.where({ id: idPartida }).update(
        compact({
          item: toVarchar<20>(dto.item?.trim()),
          nombre: toVarchar<150>(dto.nombre?.trim()),
          tipo: dto.tipo as Tipo | undefined,
          orden: dto.orden,
          updated_at: nowInstant(),
        }),
      );
    } catch (e) {
      throwIfUniqueViolation(e, MSG_ITEM_PARTIDA);
      throw e;
    }
    return this.partida(idCentroCosto, idPartida);
  }

  async eliminarPartida(idCentroCosto: number, idPartida: number) {
    await this.partidaOFalla(idCentroCosto, idPartida);
    const subs = await this.db.orm.public.obra_subpartida.where({ id_partida: idPartida }).all();
    if ((await subpartidasConAvance(this.db.orm.public, subs.map((s) => s.id))) > 0) {
      throw new ConflictException('La partida tiene subpartidas con avance registrado: no se puede eliminar');
    }
    await this.db.orm.public.obra_partida.where({ id: idPartida }).delete();
    return { deleted: true, id: idPartida };
  }

  // ─── Subpartidas ───────────────────────────────────────────────────────────
  async crearSubpartida(idCentroCosto: number, idPartida: number, dto: CreateSubpartidaDto): Promise<ObraSubpartidaDto> {
    await this.partidaOFalla(idCentroCosto, idPartida);
    validarFechas(dto.fecha_inicio, dto.fecha_fin);
    const hermanas = await this.db.orm.public.obra_subpartida.where({ id_partida: idPartida }).all();
    const orden = hermanas.reduce((m, s) => Math.max(m, s.orden), 0) + 1;
    try {
      const row = await this.db.orm.public.obra_subpartida.create({
        id_partida: idPartida,
        id_centro_costo: idCentroCosto,
        item: toVarchar<20>(dto.item.trim()),
        nombre: toVarchar<150>(dto.nombre.trim()),
        tipo: (dto.tipo ?? null) as Tipo | null,
        fecha_inicio: toDateOnly(dto.fecha_inicio)!,
        fecha_fin: toDateOnly(dto.fecha_fin)!,
        orden,
        observacion: toVarchar<200>(dto.observacion?.trim() || null),
      });
      return this.subpartida(idCentroCosto, row.id);
    } catch (e) {
      throwIfUniqueViolation(e, MSG_ITEM_SUB);
      throw e;
    }
  }

  async editarSubpartida(idCentroCosto: number, idSub: number, dto: UpdateSubpartidaDto): Promise<ObraSubpartidaDto> {
    const actual = await this.subOFalla(idCentroCosto, idSub);
    validarFechas(dto.fecha_inicio ?? readDateOnly(actual.fecha_inicio), dto.fecha_fin ?? readDateOnly(actual.fecha_fin));
    if (dto.id_partida !== undefined && dto.id_partida !== actual.id_partida) await this.partidaOFalla(idCentroCosto, dto.id_partida);
    try {
      await this.db.orm.public.obra_subpartida.where({ id: idSub }).update(
        compact({
          item: toVarchar<20>(dto.item?.trim()),
          nombre: toVarchar<150>(dto.nombre?.trim()),
          tipo: dto.tipo as Tipo | null | undefined,
          fecha_inicio: toDateOnly(dto.fecha_inicio),
          fecha_fin: toDateOnly(dto.fecha_fin),
          observacion: dto.observacion === undefined ? undefined : toVarchar<200>(dto.observacion?.trim() || null),
          orden: dto.orden,
          id_partida: dto.id_partida,
          updated_at: nowInstant(),
        }),
      );
    } catch (e) {
      throwIfUniqueViolation(e, MSG_ITEM_SUB);
      throw e;
    }
    return this.subpartida(idCentroCosto, idSub);
  }

  async eliminarSubpartida(idCentroCosto: number, idSub: number) {
    await this.subOFalla(idCentroCosto, idSub);
    if ((await subpartidasConAvance(this.db.orm.public, [idSub])) > 0) {
      throw new ConflictException('La subpartida tiene avance registrado: no se puede eliminar');
    }
    await this.db.orm.public.obra_subpartida.where({ id: idSub }).delete();
    return { deleted: true, id: idSub };
  }

  // ─── Metas (T33) ───────────────────────────────────────────────────────────
  async guardarMetas(idCentroCosto: number, idSub: number, dto: UpdateMetasDto): Promise<ObraSubpartidaDto> {
    await this.subOFalla(idCentroCosto, idSub);
    if (dto.metas.length > SEMANAS_META) throw new BadRequestException(`Solo hay metas para las semanas 1 a ${SEMANAS_META}`);
    const metas: (number | null)[] = Array.from({ length: SEMANAS_META }, (_v, i) => dto.metas[i] ?? null);
    metas.forEach((m, i) => {
      if (m !== null && (typeof m !== 'number' || !Number.isFinite(m) || m < 0 || m > 100)) {
        throw new BadRequestException(`La meta de la semana ${i + 1} debe ser un número de 0 a 100 (o null para el reparto automático)`);
      }
    });

    await this.db.transaction(async (tx) => {
      const tabla = tx.orm.public.obra_subpartida_semana;
      for (let semana = 1; semana <= SEMANAS_META; semana++) {
        const meta = metas[semana - 1];
        const fila = await tabla.first({ id_subpartida: idSub, numero_semana: semana });
        if (meta !== null) {
          const valor = String(Math.round(meta * 10) / 10);
          if (fila) await tabla.where({ id: fila.id }).update({ meta: valor });
          else await tabla.create({ id_subpartida: idSub, numero_semana: semana, meta: valor });
        } else if (fila) {
          // Sin meta manual: si la fila tampoco guarda avance, se elimina.
          if (fila.avance == null) await tabla.where({ id: fila.id }).delete();
          else await tabla.where({ id: fila.id }).update({ meta: null });
        }
      }
    });
    return this.subpartida(idCentroCosto, idSub);
  }

  // ─── Auxiliares ────────────────────────────────────────────────────────────
  private async partida(idCentroCosto: number, idPartida: number): Promise<ObraPartidaDto> {
    const p = (await this.listar(idCentroCosto)).find((x) => x.id === idPartida);
    if (!p) throw new NotFoundException(`Partida ${idPartida} no encontrada`);
    return p;
  }

  private async subpartida(idCentroCosto: number, idSub: number): Promise<ObraSubpartidaDto> {
    const s = (await this.listar(idCentroCosto)).flatMap((p) => p.subpartidas).find((x) => x.id === idSub);
    if (!s) throw new NotFoundException(`Subpartida ${idSub} no encontrada`);
    return s;
  }

  private async partidaOFalla(idCentroCosto: number, idPartida: number) {
    const row = await this.db.orm.public.obra_partida.first({ id: idPartida, id_centro_costo: idCentroCosto });
    if (!row) throw new NotFoundException(`Partida ${idPartida} no encontrada para CC ${idCentroCosto}`);
    return row;
  }

  private async subOFalla(idCentroCosto: number, idSub: number) {
    const row = await this.db.orm.public.obra_subpartida.first({ id: idSub, id_centro_costo: idCentroCosto });
    if (!row) throw new NotFoundException(`Subpartida ${idSub} no encontrada para CC ${idCentroCosto}`);
    return row;
  }
}
