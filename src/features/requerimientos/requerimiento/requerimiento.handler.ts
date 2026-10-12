import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { InventarioLedger } from '../../almacen/shared/inventario-ledger.js';
import { csv } from '../../almacen/shared/oc-saldos.js';
import { bloquearRequerimiento, registrarEvento, validarTrabajador } from '../shared/requerimiento-eventos.js';
import { avancePorRequerimiento } from '../shared/requerimiento-saldos.js';
import {
  CreateRequerimientoDto,
  ListRequerimientoQueryDto,
  RequerimientoLineaDto,
  RequerimientoResponseDto,
  UpdateRequerimientoDto,
} from './requerimiento.dto.js';

const CABECERA_SPEC = {
  id: I,
  numero: T,
  fecha: T,
  fecha_requerida: TN,
  id_centro_costo: I,
  centro_costo: TN,
  id_fase: IN,
  fase: TN,
  id_solicitante: I,
  solicitante: TN,
  area: TN,
  justificacion: T,
  estado: T,
  id_aprobador: IN,
  aprobador: TN,
  fecha_aprobacion: TN,
  comentario_aprobacion: TN,
  created_at: T,
  tipo: T,
  id_beneficiario: IN,
  beneficiario: TN,
  id_area: IN,
  area_nombre: TN,
  id_cotizacion_ganadora: IN,
  comentario_adjudicacion: TN,
  total_cotizaciones: I,
  total_lineas: I,
} as const;

/** Estados en los que el solicitante todavia puede modificar el FUR. */
const ESTADOS_EDITABLES = ['BORRADOR', 'OBSERVADO'];

@Injectable()
export class RequerimientoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(query: ListRequerimientoQueryDto): Promise<Paginated<RequerimientoResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const q = sqlTag(this.sql);
    const estado = query.estado ?? '';
    const cc = query.id_centro_costo ?? 0;
    const sol = query.id_solicitante ?? 0;
    const desde = query.desde ?? '1900-01-01';
    const hasta = query.hasta ?? '9999-12-31';
    const patron = `%${query.search ?? ''}%`;
    const tipo = query.tipo ?? '';
    const area = query.id_area ?? 0;

    const [count] = await q.rows<{ total: number }>({ total: I })`
      SELECT count(*)::int AS total FROM requerimiento r
       WHERE r.fecha >= ${desde}::date AND r.fecha <= ${hasta}::date
         AND (${tipo}::text = '' OR r.tipo = ${tipo}::text)
         AND (${area}::int = 0 OR r.id_area = ${area}::int)
         AND (${estado}::text = '' OR r.estado = ${estado}::text)
         AND (${cc}::int = 0 OR r.id_centro_costo = ${cc}::int)
         AND (${sol}::int = 0 OR r.id_solicitante = ${sol}::int)
         AND (${patron}::text = '%%' OR r.numero ILIKE ${patron}::text OR r.justificacion ILIKE ${patron}::text)`;

    const rows = await q.rows<Record<string, unknown>>(CABECERA_SPEC)`
      SELECT r.id, r.numero::text AS numero, r.fecha::text AS fecha, r.fecha_requerida::text AS fecha_requerida,
             r.id_centro_costo, cc.centro_costo::text AS centro_costo, r.id_fase, f."FaseProyecto"::text AS fase,
             r.id_solicitante, COALESCE(sa."NombreComercial", sa."Anexo")::text AS solicitante,
             r.area::text AS area, r.justificacion, r.estado::text AS estado,
             r.id_aprobador, COALESCE(ap."NombreComercial", ap."Anexo")::text AS aprobador,
             r.fecha_aprobacion::text AS fecha_aprobacion, r.comentario_aprobacion,
             r.created_at::text AS created_at,
             r.tipo::text AS tipo, r.id_beneficiario, COALESCE(be."NombreComercial", be."Anexo")::text AS beneficiario,
             r.id_area, ar.nombre::text AS area_nombre, r.id_cotizacion_ganadora, r.comentario_adjudicacion,
             (SELECT count(*)::int FROM cotizacion ct WHERE ct.id_requerimiento = r.id) AS total_cotizaciones,
             (SELECT count(*)::int FROM requerimiento_detalle x WHERE x.id_requerimiento = r.id) AS total_lineas
        FROM requerimiento r
        JOIN "CentroCostos" cc ON cc.id = r.id_centro_costo
        LEFT JOIN "ppto_Fases" f ON f.id = r.id_fase
        JOIN anexos sa ON sa.id = r.id_solicitante
        LEFT JOIN anexos ap ON ap.id = r.id_aprobador
        LEFT JOIN anexos be ON be.id = r.id_beneficiario
        LEFT JOIN area ar ON ar.id = r.id_area
       WHERE r.fecha >= ${desde}::date AND r.fecha <= ${hasta}::date
         AND (${tipo}::text = '' OR r.tipo = ${tipo}::text)
         AND (${area}::int = 0 OR r.id_area = ${area}::int)
         AND (${estado}::text = '' OR r.estado = ${estado}::text)
         AND (${cc}::int = 0 OR r.id_centro_costo = ${cc}::int)
         AND (${sol}::int = 0 OR r.id_solicitante = ${sol}::int)
         AND (${patron}::text = '%%' OR r.numero ILIKE ${patron}::text OR r.justificacion ILIKE ${patron}::text)
       ORDER BY r.fecha DESC, r.id DESC
       LIMIT ${pageSize}::int OFFSET ${offset}::int`;

    const data = await this.conAvance(rows);
    return toPaginated(data, count.total, page, pageSize);
  }

  /** FUR aprobados que todavia tienen cantidad por ordenar (para el selector "Desde requerimiento" de la OC). */
  async pendientesOc(): Promise<RequerimientoResponseDto[]> {
    const q = sqlTag(this.sql);
    const rows = await q.rows<Record<string, unknown>>(CABECERA_SPEC)`
      SELECT r.id, r.numero::text AS numero, r.fecha::text AS fecha, r.fecha_requerida::text AS fecha_requerida,
             r.id_centro_costo, cc.centro_costo::text AS centro_costo, r.id_fase, f."FaseProyecto"::text AS fase,
             r.id_solicitante, COALESCE(sa."NombreComercial", sa."Anexo")::text AS solicitante,
             r.area::text AS area, r.justificacion, r.estado::text AS estado,
             r.id_aprobador, COALESCE(ap."NombreComercial", ap."Anexo")::text AS aprobador,
             r.fecha_aprobacion::text AS fecha_aprobacion, r.comentario_aprobacion,
             r.created_at::text AS created_at,
             r.tipo::text AS tipo, r.id_beneficiario, COALESCE(be."NombreComercial", be."Anexo")::text AS beneficiario,
             r.id_area, ar.nombre::text AS area_nombre, r.id_cotizacion_ganadora, r.comentario_adjudicacion,
             (SELECT count(*)::int FROM cotizacion ct WHERE ct.id_requerimiento = r.id) AS total_cotizaciones,
             (SELECT count(*)::int FROM requerimiento_detalle x WHERE x.id_requerimiento = r.id) AS total_lineas
        FROM requerimiento r
        JOIN "CentroCostos" cc ON cc.id = r.id_centro_costo
        LEFT JOIN "ppto_Fases" f ON f.id = r.id_fase
        JOIN anexos sa ON sa.id = r.id_solicitante
        LEFT JOIN anexos ap ON ap.id = r.id_aprobador
        LEFT JOIN anexos be ON be.id = r.id_beneficiario
        LEFT JOIN area ar ON ar.id = r.id_area
       WHERE r.estado = 'APROBADO'
         AND EXISTS (
           SELECT 1 FROM requerimiento_detalle d
            WHERE d.id_requerimiento = r.id AND COALESCE(d.cantidad_aprobada, 0) >
                  COALESCE((SELECT SUM(l."Cantidad") FROM "ordenCompraDetalle" l WHERE l.id_requerimiento_detalle = d.id
                   AND l.id_orden_compra IN (SELECT id FROM "documentosOrigen" WHERE estado <> 'ANULADO')), 0))
       ORDER BY r.fecha DESC, r.id DESC`;
    return this.conAvance(rows);
  }

  async getById(id: number): Promise<RequerimientoResponseDto> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<Record<string, unknown>>(CABECERA_SPEC)`
      SELECT r.id, r.numero::text AS numero, r.fecha::text AS fecha, r.fecha_requerida::text AS fecha_requerida,
             r.id_centro_costo, cc.centro_costo::text AS centro_costo, r.id_fase, f."FaseProyecto"::text AS fase,
             r.id_solicitante, COALESCE(sa."NombreComercial", sa."Anexo")::text AS solicitante,
             r.area::text AS area, r.justificacion, r.estado::text AS estado,
             r.id_aprobador, COALESCE(ap."NombreComercial", ap."Anexo")::text AS aprobador,
             r.fecha_aprobacion::text AS fecha_aprobacion, r.comentario_aprobacion,
             r.created_at::text AS created_at,
             r.tipo::text AS tipo, r.id_beneficiario, COALESCE(be."NombreComercial", be."Anexo")::text AS beneficiario,
             r.id_area, ar.nombre::text AS area_nombre, r.id_cotizacion_ganadora, r.comentario_adjudicacion,
             (SELECT count(*)::int FROM cotizacion ct WHERE ct.id_requerimiento = r.id) AS total_cotizaciones,
             (SELECT count(*)::int FROM requerimiento_detalle x WHERE x.id_requerimiento = r.id) AS total_lineas
        FROM requerimiento r
        JOIN "CentroCostos" cc ON cc.id = r.id_centro_costo
        LEFT JOIN "ppto_Fases" f ON f.id = r.id_fase
        JOIN anexos sa ON sa.id = r.id_solicitante
        LEFT JOIN anexos ap ON ap.id = r.id_aprobador
        LEFT JOIN anexos be ON be.id = r.id_beneficiario
        LEFT JOIN area ar ON ar.id = r.id_area
       WHERE r.id = ${id}::int`;
    if (!row) throw new NotFoundException(`Requerimiento ${id} no encontrado`);
    const [base] = await this.conAvance([row]);

    const lineas = await q.rows<Record<string, unknown>>({
      id: I,
      id_producto: I,
      codigo: T,
      descripcion: T,
      tipo_producto: T,
      unidad: T,
      cantidad: T,
      cantidad_aprobada: TN,
      precio_referencial: TN,
      observaciones: TN,
      id_beneficiario: IN,
      beneficiario: TN,
      cantidad_ordenada: T,
      saldo_por_ordenar: T,
    })`
      SELECT d.id, d.id_producto, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             p.tipo_producto::text AS tipo_producto, COALESCE(u.simbolo, u.codigo)::text AS unidad,
             d.cantidad::text AS cantidad, d.cantidad_aprobada::text AS cantidad_aprobada,
             d.precio_referencial::text AS precio_referencial, d.observaciones,
             d.id_beneficiario, COALESCE(bn."NombreComercial", bn."Anexo")::text AS beneficiario,
             COALESCE(o.ordenado, 0)::text AS cantidad_ordenada,
             GREATEST(COALESCE(d.cantidad_aprobada, 0) - COALESCE(o.ordenado, 0), 0)::text AS saldo_por_ordenar
        FROM requerimiento_detalle d
        JOIN producto p ON p.id = d.id_producto
        JOIN unidad_medida u ON u.id = p.id_unidad_medida
        LEFT JOIN anexos bn ON bn.id = d.id_beneficiario
        LEFT JOIN (
          SELECT id_requerimiento_detalle AS id, SUM("Cantidad") AS ordenado
            FROM "ordenCompraDetalle" WHERE id_requerimiento_detalle IS NOT NULL
             AND id_orden_compra IN (SELECT id FROM "documentosOrigen" WHERE estado <> 'ANULADO')
           GROUP BY id_requerimiento_detalle
        ) o ON o.id = d.id
       WHERE d.id_requerimiento = ${id}::int ORDER BY d.id`;

    const eventos = await q.rows<Record<string, unknown>>({
      id: I,
      accion: T,
      estado_anterior: TN,
      estado_nuevo: T,
      id_anexo: IN,
      anexo: TN,
      comentario: TN,
      created_at: T,
    })`
      SELECT e.id, e.accion::text AS accion, e.estado_anterior::text AS estado_anterior, e.estado_nuevo::text AS estado_nuevo,
             e.id_anexo, COALESCE(a."NombreComercial", a."Anexo")::text AS anexo, e.comentario, e.created_at::text AS created_at
        FROM requerimiento_evento e LEFT JOIN anexos a ON a.id = e.id_anexo
       WHERE e.id_requerimiento = ${id}::int ORDER BY e.id`;

    const ordenes = await q.rows<Record<string, unknown>>({
      id: I,
      id_oc: TN,
      numero_oc: TN,
      total: TN,
      fecha_emision: TN,
      numero_documento: TN,
      clase_documento: TN,
      estado: TN,
    })`
      SELECT id, id_oc::text AS id_oc, numero_oc::text AS numero_oc, total::text AS total, fecha_emision::text AS fecha_emision,
             numero_documento::text AS numero_documento, clase_documento::text AS clase_documento, estado::text AS estado
        FROM "documentosOrigen" WHERE id_requerimiento = ${id}::int ORDER BY id`;

    return {
      ...base,
      lineas: lineas as unknown as RequerimientoResponseDto['lineas'],
      eventos: eventos as unknown as RequerimientoResponseDto['eventos'],
      ordenes_compra: ordenes as unknown as RequerimientoResponseDto['ordenes_compra'],
    };
  }

  // -------------------------------------------------------------- escritura

  async create(dto: CreateRequerimientoDto): Promise<RequerimientoResponseDto> {
    const id = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const tipo = dto.tipo ?? 'COMPRA';
      await this.validarCabecera(tx, dto.id_centro_costo, dto.id_fase, dto.id_solicitante);
      await this.validarExtras(tx, dto.id_beneficiario, dto.id_area);
      await this.validarLineas(tx, dto.lineas, tipo, dto.id_beneficiario);
      const numero = await this.ledger.siguienteNumero(tx, 'FUR');
      const [fur] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO requerimiento (numero, fecha, fecha_requerida, id_centro_costo, id_fase, id_solicitante, area, justificacion,
                                   tipo, id_beneficiario, id_area)
        VALUES (${numero}, ${dto.fecha}::date, NULLIF(${dto.fecha_requerida ?? ''}::text, '')::date, ${dto.id_centro_costo}::int,
                NULLIF(${dto.id_fase ?? 0}::int, 0), ${dto.id_solicitante}::int, NULLIF(${dto.area ?? ''}::text, ''), ${dto.justificacion}::text,
                ${tipo}::text, NULLIF(${dto.id_beneficiario ?? 0}::int, 0), NULLIF(${dto.id_area ?? 0}::int, 0))
        RETURNING id`;
      await this.insertarLineas(tx, fur.id, dto.lineas);
      await registrarEvento(this.sql, tx, fur.id, 'CREAR', null, 'BORRADOR', dto.id_solicitante, null);
      return fur.id;
    });
    return this.getById(id);
  }

  async update(id: number, dto: UpdateRequerimientoDto): Promise<RequerimientoResponseDto> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const actual = await bloquearRequerimiento(this.sql, tx, id);
      if (!actual) throw new NotFoundException(`Requerimiento ${id} no encontrado`);
      if (!ESTADOS_EDITABLES.includes(actual.estado)) {
        throw new ConflictException(`Un requerimiento ${actual.estado} no se puede modificar (solo BORRADOR u OBSERVADO)`);
      }
      await this.validarCabecera(
        tx,
        dto.id_centro_costo ?? actual.id_centro_costo,
        dto.id_fase ?? actual.id_fase ?? undefined,
        dto.id_solicitante,
      );
      await this.validarExtras(tx, dto.id_beneficiario, dto.id_area);
      if (dto.lineas) {
        const [cot] = await q.rows<{ n: number }>({ n: I }, tx)`
          SELECT count(*)::int AS n FROM cotizacion WHERE id_requerimiento = ${id}::int`;
        if (cot.n > 0) {
          throw new ConflictException('El requerimiento tiene cotizaciones; elimínelas antes de cambiar el detalle');
        }
        const [benef] = await q.rows<{ id_beneficiario: number | null }>({ id_beneficiario: IN }, tx)`
          SELECT id_beneficiario FROM requerimiento WHERE id = ${id}::int`;
        await this.validarLineas(tx, dto.lineas, dto.tipo ?? actual.tipo, dto.id_beneficiario ?? benef?.id_beneficiario ?? undefined);
      }

      await q.run(tx)`
        UPDATE requerimiento SET
          tipo = CASE WHEN ${dto.tipo !== undefined}::boolean THEN ${dto.tipo ?? 'COMPRA'}::text ELSE tipo END,
          id_beneficiario = CASE WHEN ${dto.id_beneficiario !== undefined}::boolean THEN NULLIF(${dto.id_beneficiario ?? 0}::int, 0) ELSE id_beneficiario END,
          id_area = CASE WHEN ${dto.id_area !== undefined}::boolean THEN NULLIF(${dto.id_area ?? 0}::int, 0) ELSE id_area END,
          fecha = CASE WHEN ${dto.fecha !== undefined}::boolean THEN ${dto.fecha ?? '1900-01-01'}::date ELSE fecha END,
          fecha_requerida = CASE WHEN ${dto.fecha_requerida !== undefined}::boolean
                                 THEN NULLIF(${dto.fecha_requerida ?? ''}::text, '')::date ELSE fecha_requerida END,
          id_centro_costo = CASE WHEN ${dto.id_centro_costo !== undefined}::boolean THEN ${dto.id_centro_costo ?? 0}::int ELSE id_centro_costo END,
          id_fase = CASE WHEN ${dto.id_fase !== undefined}::boolean THEN NULLIF(${dto.id_fase ?? 0}::int, 0) ELSE id_fase END,
          id_solicitante = CASE WHEN ${dto.id_solicitante !== undefined}::boolean THEN ${dto.id_solicitante ?? 0}::int ELSE id_solicitante END,
          area = CASE WHEN ${dto.area !== undefined}::boolean THEN NULLIF(${dto.area ?? ''}::text, '') ELSE area END,
          justificacion = CASE WHEN ${dto.justificacion !== undefined}::boolean THEN ${dto.justificacion ?? ''}::text ELSE justificacion END
         WHERE id = ${id}::int`;

      if (dto.lineas) {
        await q.run(tx)`DELETE FROM requerimiento_detalle WHERE id_requerimiento = ${id}::int`;
        await this.insertarLineas(tx, id, dto.lineas);
      }
    });
    return this.getById(id);
  }

  async delete(id: number): Promise<{ deleted: boolean; id: number }> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const actual = await bloquearRequerimiento(this.sql, tx, id);
      if (!actual) throw new NotFoundException(`Requerimiento ${id} no encontrado`);
      const [ev] = await q.rows<{ n: number }>({ n: I }, tx)`
        SELECT count(*)::int AS n FROM requerimiento_evento WHERE id_requerimiento = ${id}::int`;
      if (actual.estado !== 'BORRADOR' || ev.n > 1) {
        throw new ConflictException('Solo se puede eliminar un requerimiento en BORRADOR que nunca se envió; use anular');
      }
      await q.run(tx)`DELETE FROM requerimiento WHERE id = ${id}::int`;
    });
    return { deleted: true, id };
  }

  // ---------------------------------------------------------------- privado

  private async conAvance(rows: Array<Record<string, unknown>>): Promise<RequerimientoResponseDto[]> {
    const aprobados = rows.filter((r) => r['estado'] === 'APROBADO').map((r) => r['id'] as number);
    const avance = await avancePorRequerimiento(this.sql, aprobados);
    return rows.map((r) => ({
      ...(r as unknown as RequerimientoResponseDto),
      avance: avance.get(r['id'] as number) ?? null,
    }));
  }

  private async validarCabecera(
    tx: Tx,
    idCentroCosto: number,
    idFase: number | undefined,
    idSolicitante: number | undefined,
  ): Promise<void> {
    const q = sqlTag(this.sql);
    const [cc] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "CentroCostos" WHERE id = ${idCentroCosto}::int`;
    if (!cc) throw new BadRequestException(`Centro de costos ${idCentroCosto} no existe`);
    if (idFase !== undefined) {
      const [f] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "ppto_Fases" WHERE id = ${idFase}::int`;
      if (!f) throw new BadRequestException(`Fase ${idFase} no existe`);
    }
    if (idSolicitante !== undefined) await validarTrabajador(this.sql, tx, idSolicitante, 'id_solicitante');
  }

  /** Beneficiario (cualquier Anexo existente) y area de la empresa. */
  private async validarExtras(tx: Tx, idBeneficiario: number | undefined, idArea: number | undefined): Promise<void> {
    const q = sqlTag(this.sql);
    if (idBeneficiario !== undefined) {
      const [b] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM anexos WHERE id = ${idBeneficiario}::int`;
      if (!b) throw new BadRequestException(`Beneficiario ${idBeneficiario} no existe`);
    }
    if (idArea !== undefined) {
      const [a] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM area WHERE id = ${idArea}::int AND estado`;
      if (!a) throw new BadRequestException(`Área ${idArea} no existe o está inactiva`);
    }
  }

  private async validarLineas(
    tx: Tx,
    lineas: RequerimientoLineaDto[],
    tipo: string,
    idBeneficiarioCabecera?: number,
  ): Promise<void> {
    const ids = lineas.map((l) => l.id_producto);
    if (tipo === 'COMPRA') {
      if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay productos repetidos en las líneas');
    } else {
      // Planilla por trabajador: el mismo concepto se repite, pero no para el mismo beneficiario.
      const claves = lineas.map((l) => `${l.id_producto}:${l.id_beneficiario ?? idBeneficiarioCabecera ?? 0}`);
      if (new Set(claves).size !== claves.length) throw new BadRequestException('Hay líneas repetidas para el mismo beneficiario');
      for (const l of lineas) {
        if (!(l.id_beneficiario ?? idBeneficiarioCabecera)) {
          throw new BadRequestException('Cada línea necesita un beneficiario (en la línea o en la cabecera)');
        }
        if (l.precio_referencial === undefined || Number(l.precio_referencial) <= 0) {
          throw new BadRequestException('En este tipo de requerimiento cada línea necesita un importe (precio referencial) mayor a 0');
        }
      }
    }
    for (const l of lineas) {
      if (Number(l.cantidad) <= 0) throw new BadRequestException(`La cantidad del producto ${l.id_producto} debe ser mayor a 0`);
    }
    const idsUnicos = [...new Set(ids)];
    const q = sqlTag(this.sql);
    const encontrados = await q.rows<{ id: number; descripcion: string; estado: boolean }>(
      { id: I, descripcion: T, estado: { codecId: 'pg/bool@1', nullable: false } },
      tx,
    )`SELECT id, descripcion::text AS descripcion, estado FROM producto
        WHERE id = ANY(string_to_array(${csv(idsUnicos)}::text, ',')::int[])`;
    const porId = new Map(encontrados.map((p) => [p.id, p]));
    for (const id of idsUnicos) {
      const p = porId.get(id);
      if (!p) throw new BadRequestException(`Producto ${id} no encontrado`);
      if (!p.estado) throw new BadRequestException(`El producto "${p.descripcion}" está inactivo`);
    }
  }

  private async insertarLineas(tx: Tx, idRequerimiento: number, lineas: RequerimientoLineaDto[]): Promise<void> {
    const q = sqlTag(this.sql);
    for (const l of lineas) {
      await q.run(tx)`
        INSERT INTO requerimiento_detalle (id_requerimiento, id_producto, cantidad, precio_referencial, observaciones, id_beneficiario)
        VALUES (${idRequerimiento}::int, ${l.id_producto}::int, ${l.cantidad}::numeric,
                CASE WHEN ${l.precio_referencial !== undefined}::boolean THEN ${l.precio_referencial ?? '0'}::numeric ELSE NULL END,
                NULLIF(${l.observaciones ?? ''}::text, ''), NULLIF(${l.id_beneficiario ?? 0}::int, 0))`;
    }
  }
}
