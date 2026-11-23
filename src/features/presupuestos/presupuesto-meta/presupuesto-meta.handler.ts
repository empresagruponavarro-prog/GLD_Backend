import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { toDecimalString, toVarchar } from '../../../platform/db/varchar-helpers.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { ESTADOS_EDITABLES, type EstadoPpto } from '../aprobacion/estados.js';
import { ConciliarCompromisosService, type ResultadoConciliacion } from '../compromisos/conciliar-compromisos.service.js';
import { bloquearPresupuestoPorCodigo, type PresupuestoBloqueado } from '../cotizaciones-ppto/contexto-ppto.js';
import type { ResultadoReprorrateo } from '../cotizaciones-ppto/reprorrateo.js';
import { ReprorrateoService } from '../cotizaciones-ppto/reprorrateo.service.js';
import { PptoDetalleItemsHandler } from '../detalle-items/detalle-items.handler.js';
import type { PartidaItemsResponseDto } from '../plantillas-items/plantillas-items.dto.js';
import {
  diferenciaMeta,
  metaDeHijos,
  metaSubfase,
  planificarAjuste,
  porcentajeSobreBase,
  puMetaEfectivo,
  redondear2,
} from '../shared/costos-meta.js';
import { recalcularMeta } from '../shared/recalcular-meta.js';
import type {
  AjusteMetaDto,
  MetaFaseDto,
  MetaItemDto,
  MetaSubfaseDto,
  MetaSubfaseNodoDto,
  PresupuestoMetaResponseDto,
  SyncItemsMetaDto,
} from './presupuesto-meta.dto.js';

const f2 = (n: number) => n.toFixed(2);

interface FaseRow {
  id: number;
  detalle: string | null;
  nombre: string;
  base: string;
}
interface SubfaseRow {
  id: number;
  detalle: string | null;
  nombre: string;
  base: string;
  meta: string | null;
  cotizaciones: number;
}
interface ItemRow {
  id: number;
  sub: number;
  numero: string | null;
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  pu_base: string;
  pu_meta: string | null;
  total_base: string;
  total_meta: string;
}

/**
 * Presupuesto Meta (plan 11): el paso donde se estima el precio Meta de cada ítem a partir del Base. Solo se cambian precios (la estructura
 * se arma en el Base): por ítem, con un % para toda la subfase, o con un monto a mano en una subfase sin ítems. Toda escritura bloquea el
 * presupuesto (`FOR UPDATE`), solo se admite en `ESTADOS_EDITABLES`, rearma el Meta, vuelve a repartir las cotizaciones de la subfase y
 * concilia los compromisos, todo en la misma transacción; la respuesta se arma **después del commit**.
 */
@Injectable()
export class PresupuestoMetaHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly items: PptoDetalleItemsHandler,
    private readonly reprorrateo: ReprorrateoService,
    private readonly conciliacion: ConciliarCompromisosService,
  ) {}

  // ---------------------------------------------------------------- lectura

  /** Base vs Meta de todo el presupuesto: fases → subfases → ítems, con las diferencias. */
  async getMeta(idOrCode: string | number): Promise<PresupuestoMetaResponseDto> {
    const ppto = await this.cargarPresupuesto(idOrCode);
    const fases = await this.arbol(String(ppto.IdPresupuesto ?? ''));

    const base = metaDeHijos(
      fases.map((f) => Number(f.base)),
      Number(ppto.CostoDirecto) || 0,
    );
    const meta = metaDeHijos(
      fases.map((f) => Number(f.meta)),
      Number(ppto.CostoDirecto) || 0,
    );
    const pct = porcentajeSobreBase(base, meta);
    return {
      id: ppto.id,
      id_presupuesto: ppto.IdPresupuesto ?? null,
      estado_ppto: ppto.estado_ppto,
      editable: ESTADOS_EDITABLES.includes(ppto.estado_ppto as EstadoPpto),
      totales: { base: f2(base), meta: f2(meta), diferencia: f2(diferenciaMeta(base, meta)), diferencia_pct: pct === null ? null : f2(pct) },
      fases,
    };
  }

  // -------------------------------------------------------------- escritura

  /** Fija (o devuelve al Base, con `null`) el precio Meta de los ítems indicados de la subfase. Los demás no cambian. */
  async syncItemsMeta(idSubfase: number, dto: SyncItemsMetaDto, user?: AuthUser): Promise<PartidaItemsResponseDto> {
    const r = await this.editarMeta(idSubfase, user, async (tx) => {
      const ids = dto.items.map((i) => i.id);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay ítems repetidos en la lista');
      const delaSubfase = await tx.orm.public.ppto_DetalleItems.where((i: any) => i.id_detalle_categoria.eq(idSubfase)).all();
      const validos = new Set(delaSubfase.map((i: any) => i.id as number));
      const ajenos = ids.filter((id) => !validos.has(id));
      if (ajenos.length > 0) throw new BadRequestException(`Los ítems ${ajenos.join(', ')} no pertenecen a la subfase ${idSubfase}`);
      for (const it of dto.items) {
        const meta = it.CostoUnitarioMeta === null ? null : toDecimalString(redondear2(it.CostoUnitarioMeta));
        await tx.orm.public.ppto_DetalleItems.where({ id: it.id }).update({ CostoUnitarioMeta: meta } as any);
      }
    });
    return this.respuestaDeItems(idSubfase, r);
  }

  /** Aplica un % sobre el precio Base de **todos** los ítems de la subfase (su precio Meta pasa a ser el resultado). */
  async ajustarSubfase(idSubfase: number, dto: AjusteMetaDto, user?: AuthUser): Promise<PartidaItemsResponseDto> {
    const r = await this.editarMeta(idSubfase, user, async (tx) => {
      const delaSubfase = await tx.orm.public.ppto_DetalleItems
        .where((i: any) => i.id_detalle_categoria.eq(idSubfase))
        .orderBy((i: any) => i.Orden.asc())
        .all();
      if (delaSubfase.length === 0) {
        throw new BadRequestException('La subfase no tiene ítems: no hay precios que ajustar. Si no va a llevar ítems, fije su monto Meta');
      }
      const plan = planificarAjuste(
        delaSubfase.map((i: any) => ({ id: i.id as number, base: Number(i.CostoUnitario) || 0, etiqueta: String(i.Item ?? `#${i.id}`) })),
        dto.porcentaje,
      );
      if (plan.invalidos.length > 0) {
        throw new BadRequestException(`Un ajuste de ${dto.porcentaje} % dejaría el precio Meta de ${plan.invalidos.join(', ')} por debajo de S/ 0.01`);
      }
      if (plan.cambios.length === 0) throw new BadRequestException('Ningún ítem de la subfase tiene precio Base: no hay sobre qué aplicar el %');
      for (const c of plan.cambios) {
        await tx.orm.public.ppto_DetalleItems.where({ id: c.id }).update({ CostoUnitarioMeta: toDecimalString(c.pu) } as any);
      }
    });
    return this.respuestaDeItems(idSubfase, r);
  }

  /** Monto Meta escrito a mano de una subfase **sin ítems** (`null` = igual al Base). */
  async fijarMetaSubfase(idSubfase: number, dto: MetaSubfaseDto, user?: AuthUser): Promise<MetaSubfaseNodoDto> {
    const { codigo } = await this.editarMeta(idSubfase, user, async (tx) => {
      const items = await tx.orm.public.ppto_DetalleItems.where((i: any) => i.id_detalle_categoria.eq(idSubfase)).all();
      if (items.length > 0) {
        throw new ConflictException('Esta subfase tiene ítems: su Meta es la suma de ellos. Ajuste el precio Meta de sus ítems');
      }
      const meta = dto.CostoDirectoMeta === null ? null : toDecimalString(redondear2(dto.CostoDirectoMeta));
      await tx.orm.public.ppto_DetalleFasesCate.where({ id: idSubfase }).update({ CostoDirectoMeta: meta } as any);
    });
    const fases = await this.arbol(codigo);
    const nodo = fases.flatMap((f) => f.subfases).find((s) => s.id === idSubfase);
    if (!nodo) throw new NotFoundException(`Subfase ${idSubfase} no encontrada`);
    return nodo;
  }

  // ---------------------------------------------------------------- privado

  /**
   * Flujo común de toda escritura del Meta: bloquea el presupuesto, exige un estado editable, escribe, rearma el Meta, vuelve a repartir
   * las cotizaciones de la subfase y concilia los compromisos. Devuelve lo que pasó con ambos.
   */
  private async editarMeta(
    idSubfase: number,
    user: AuthUser | undefined,
    escribir: (tx: Tx, ppto: PresupuestoBloqueado) => Promise<void>,
  ): Promise<{ codigo: string; reprorrateo: ResultadoReprorrateo; compromisos: ResultadoConciliacion }> {
    const subfase = await this.db.orm.public.ppto_DetalleFasesCate.first({ id: idSubfase });
    if (!subfase) throw new NotFoundException(`Subfase ${idSubfase} del presupuesto no encontrada`);
    if (!subfase.IdPresupuesto) throw new ConflictException('La subfase no pertenece a un presupuesto: no tiene Meta');
    const codigo = String(subfase.IdPresupuesto);

    return this.db.transaction(async (tx) => {
      const ppto = await bloquearPresupuestoPorCodigo(this.sql, tx, codigo);
      if (!ppto) throw new NotFoundException(`Presupuesto ${codigo} no encontrado`);
      if (!ESTADOS_EDITABLES.includes(ppto.estado as EstadoPpto)) {
        throw new ConflictException(
          `El presupuesto ${ppto.codigo} está ${ppto.estado}: no se puede cambiar su Meta. Haga el cambio con una nueva versión o con un presupuesto adicional`,
        );
      }
      await escribir(tx, ppto);
      await recalcularMeta(this.sql, tx, ppto.codigo);
      const reprorrateo = await this.reprorrateo.reprorratearSubpartida(tx, ppto, idSubfase, user);
      const compromisos = await this.conciliacion.conciliar(tx, ppto, user);
      return { codigo, reprorrateo, compromisos };
    });
  }

  /** La respuesta de una escritura de ítems es la de `GET …/items` (ya con el Meta) más lo que pasó con las cotizaciones y los compromisos. */
  private async respuestaDeItems(
    idSubfase: number,
    r: { reprorrateo: ResultadoReprorrateo; compromisos: ResultadoConciliacion },
  ): Promise<PartidaItemsResponseDto> {
    const respuesta = await this.items.list(idSubfase);
    return { ...respuesta, reprorrateo: r.reprorrateo, compromisos: r.compromisos };
  }

  /** Busca por código `IdPresupuesto` o por id numérico (un `number` busca solo por id). */
  private async cargarPresupuesto(idOrCode: string | number) {
    const orm = this.db.orm.public;
    let fila = null;
    if (typeof idOrCode === 'string') fila = await orm.ppto_Principal.first({ IdPresupuesto: toVarchar(idOrCode) });
    const numero = typeof idOrCode === 'number' ? idOrCode : /^\d+$/.test(idOrCode) ? Number(idOrCode) : null;
    if (!fila && numero !== null) fila = await orm.ppto_Principal.first({ id: numero });
    if (!fila) throw new NotFoundException(`Presupuesto "${idOrCode}" no encontrado`);
    return fila;
  }

  /** Fases → subfases → ítems del presupuesto con su Base y su Meta, calculados con las reglas de `costos-meta.ts`. */
  private async arbol(codigo: string): Promise<MetaFaseDto[]> {
    const q = sqlTag(this.sql);
    const fases = await q.rows<FaseRow>({ id: I, detalle: TN, nombre: T, base: T })`
      SELECT f.id, f."IdPresupuestoDetalle"::text AS detalle,
             COALESCE(m."FaseProyecto", f."IdpptoFase", 'Fase #' || f.id::text)::text AS nombre,
             COALESCE(f."CostoDirecto", 0)::text AS base
        FROM "ppto_DetalleFases" f
        LEFT JOIN "ppto_Fases" m ON m."IdpptoFase" = f."IdpptoFase"
       WHERE f."IdPresupuesto" = ${codigo}::text
       ORDER BY f.id`;
    const subfases = await q.rows<SubfaseRow>({ id: I, detalle: TN, nombre: T, base: T, meta: TN, cotizaciones: I })`
      SELECT c.id, c."IdPresupuestoDetalle"::text AS detalle,
             COALESCE((SELECT fc."Descripcion" FROM "ppto_FasesCategorias" fc WHERE fc."IdpptoFaseCategoria" = c."IdpptoFaseCategoria" LIMIT 1),
                      'Subfase #' || c.id::text)::text AS nombre,
             COALESCE(c."CostoDirecto", 0)::text AS base, c."CostoDirectoMeta"::text AS meta,
             (SELECT count(*) FROM ppto_cotizacion q WHERE q.id_detalle_categoria = c.id)::int AS cotizaciones
        FROM "ppto_DetalleFasesCate" c
       WHERE c."IdPresupuesto" = ${codigo}::text
       ORDER BY c.id`;
    const items = await q.rows<ItemRow>({ id: I, sub: I, numero: TN, codigo: T, descripcion: T, unidad: T, cantidad: T, pu_base: T, pu_meta: TN, total_base: T, total_meta: T })`
      SELECT i.id, i.id_detalle_categoria AS sub, i."Item"::text AS numero, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             COALESCE(u.simbolo, u.codigo)::text AS unidad, i."Cantidad"::text AS cantidad,
             i."CostoUnitario"::text AS pu_base, i."CostoUnitarioMeta"::text AS pu_meta,
             i."CostoTotal"::text AS total_base, i."CostoTotalMeta"::text AS total_meta
        FROM "ppto_DetalleItems" i
        JOIN producto p ON p.id = i.id_producto
        JOIN unidad_medida u ON u.id = i.id_unidad_medida
       WHERE i."IdPresupuesto" = ${codigo}::text
       ORDER BY i.id_detalle_categoria, i."Orden", i.id`;

    return fases.map((fase) => {
      const nodos: MetaSubfaseNodoDto[] = subfases
        .filter((s) => !!fase.detalle && s.detalle === fase.detalle)
        .map((s) => {
          const propios = items.filter((i) => i.sub === s.id);
          const base = Number(s.base);
          const metaGuardado = s.meta === null ? null : Number(s.meta);
          const meta = metaSubfase({ itemsTotalMeta: propios.map((i) => Number(i.total_meta)), metaManual: metaGuardado, base });
          return {
            id: s.id,
            nombre: s.nombre,
            base: f2(base),
            meta: f2(meta),
            meta_manual: propios.length === 0 && metaGuardado !== null,
            cotizaciones: s.cotizaciones,
            items: propios.map<MetaItemDto>((i) => {
              const puBase = Number(i.pu_base);
              const puPropio = i.pu_meta === null ? null : Number(i.pu_meta);
              return {
                id: i.id,
                numero: i.numero,
                codigo: i.codigo,
                descripcion: i.descripcion,
                unidad: i.unidad,
                cantidad: i.cantidad,
                pu_base: f2(puBase),
                pu_meta: f2(puMetaEfectivo(puBase, puPropio)),
                pu_meta_propio: puPropio !== null,
                total_base: f2(Number(i.total_base)),
                total_meta: f2(Number(i.total_meta)),
              };
            }),
          };
        });
      const baseFase = Number(fase.base);
      return {
        id: fase.id,
        nombre: fase.nombre,
        base: f2(
          metaDeHijos(
            nodos.map((n) => Number(n.base)),
            baseFase,
          ),
        ),
        meta: f2(
          metaDeHijos(
            nodos.map((n) => Number(n.meta)),
            baseFase,
          ),
        ),
        subfases: nodos,
      };
    });
  }
}
