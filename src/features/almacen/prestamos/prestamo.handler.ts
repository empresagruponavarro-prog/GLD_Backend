import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, IN, T, TN, sqlTag } from '../shared/almacen-sql.js';
import { InventarioLedger } from '../shared/inventario-ledger.js';
import {
  CreatePrestamoDto,
  ListPrestamoQueryDto,
  PrestamoLineaResponseDto,
  PrestamoResponseDto,
  PrestamoRetornoResponseDto,
  RegistrarRetornoDto,
} from './prestamo.dto.js';

const CABECERA_SPEC = {
  id: I,
  numero: T,
  fecha_prestamo: T,
  id_almacen: I,
  almacen: T,
  id_centro_costo: IN,
  centro_costo: TN,
  id_responsable: I,
  responsable: T,
  documento_referencia: TN,
  dias_autorizados: I,
  fecha_prevista_retorno: T,
  estado: T,
  estado_plazo: T,
  dias_fuera: I,
  observaciones: TN,
  created_at: T,
  total_lineas: I,
} as const;

@Injectable()
export class PrestamoHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(query: ListPrestamoQueryDto): Promise<Paginated<PrestamoResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const q = sqlTag(this.sql);
    const estado = query.estado ?? '';
    const plazo = query.estado_plazo ?? '';
    const resp = query.id_responsable ?? 0;
    const cc = query.id_centro_costo ?? 0;
    const alm = query.id_almacen ?? 0;
    const numero = query.numero ? `%${query.numero}%` : '';

    const rows = await q.rows<Record<string, unknown> & { total_rows: number }>({ ...CABECERA_SPEC, total_rows: I })`
      SELECT t.*, count(*) OVER()::int AS total_rows FROM (
        SELECT p.id, p.numero::text AS numero, p.fecha_prestamo::text AS fecha_prestamo, p.id_almacen, a.nombre AS almacen,
               p.id_centro_costo, cc.centro_costo::text AS centro_costo, p.id_responsable,
               COALESCE(r."Anexo", r."NombreComercial", '')::text AS responsable, p.documento_referencia::text AS documento_referencia,
               p.dias_autorizados, p.fecha_prevista_retorno::text AS fecha_prevista_retorno, p.estado::text AS estado,
               (CASE WHEN p.estado = 'ANULADO' THEN 'ANULADO'
                     WHEN p.estado = 'CERRADO' THEN (CASE WHEN u.ult <= p.fecha_prevista_retorno THEN 'RETORNADO_A_TIEMPO' ELSE 'RETORNADO_CON_RETRASO' END)
                     WHEN (now() AT TIME ZONE 'America/Lima')::date < p.fecha_prevista_retorno THEN 'EN_PLAZO'
                     WHEN (now() AT TIME ZONE 'America/Lima')::date = p.fecha_prevista_retorno THEN 'VENCE_HOY'
                     ELSE 'VENCIDO' END)::text AS estado_plazo,
               ((CASE WHEN p.estado = 'CERRADO' THEN u.ult ELSE (now() AT TIME ZONE 'America/Lima')::date END) - p.fecha_prestamo)::int AS dias_fuera,
               p.observaciones, p.created_at::text AS created_at,
               (SELECT count(*)::int FROM almacen_prestamo_detalle x WHERE x.id_prestamo = p.id) AS total_lineas
          FROM almacen_prestamo p
          JOIN almacen a ON a.id = p.id_almacen
          JOIN anexos r ON r.id = p.id_responsable
          LEFT JOIN "CentroCostos" cc ON cc.id = p.id_centro_costo
          LEFT JOIN LATERAL (
            SELECT max(rt.fecha_retorno) AS ult FROM almacen_prestamo_retorno rt
              JOIN almacen_prestamo_detalle d ON d.id = rt.id_prestamo_detalle WHERE d.id_prestamo = p.id
          ) u ON true
         WHERE (${estado}::text = '' OR p.estado = ${estado}::text)
           AND (${resp}::int = 0 OR p.id_responsable = ${resp}::int)
           AND (${cc}::int = 0 OR p.id_centro_costo = ${cc}::int)
           AND (${alm}::int = 0 OR p.id_almacen = ${alm}::int)
           AND (${numero}::text = '' OR p.numero ILIKE ${numero}::text)
      ) t
       WHERE (${plazo}::text = '' OR t.estado_plazo = ${plazo}::text)
       ORDER BY t.fecha_prestamo DESC, t.id DESC
       LIMIT ${pageSize}::int OFFSET ${offset}::int`;

    const total = rows.length > 0 ? rows[0].total_rows : 0;
    const data = rows.map(({ total_rows: _t, ...rest }) => rest) as unknown as PrestamoResponseDto[];
    return toPaginated(data, total, page, pageSize);
  }

  async getById(id: number): Promise<PrestamoResponseDto> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<Record<string, unknown>>(CABECERA_SPEC)`
      SELECT p.id, p.numero::text AS numero, p.fecha_prestamo::text AS fecha_prestamo, p.id_almacen, a.nombre AS almacen,
             p.id_centro_costo, cc.centro_costo::text AS centro_costo, p.id_responsable,
             COALESCE(r."Anexo", r."NombreComercial", '')::text AS responsable, p.documento_referencia::text AS documento_referencia,
             p.dias_autorizados, p.fecha_prevista_retorno::text AS fecha_prevista_retorno, p.estado::text AS estado,
             (CASE WHEN p.estado = 'ANULADO' THEN 'ANULADO'
                   WHEN p.estado = 'CERRADO' THEN (CASE WHEN u.ult <= p.fecha_prevista_retorno THEN 'RETORNADO_A_TIEMPO' ELSE 'RETORNADO_CON_RETRASO' END)
                   WHEN (now() AT TIME ZONE 'America/Lima')::date < p.fecha_prevista_retorno THEN 'EN_PLAZO'
                   WHEN (now() AT TIME ZONE 'America/Lima')::date = p.fecha_prevista_retorno THEN 'VENCE_HOY'
                   ELSE 'VENCIDO' END)::text AS estado_plazo,
             ((CASE WHEN p.estado = 'CERRADO' THEN u.ult ELSE (now() AT TIME ZONE 'America/Lima')::date END) - p.fecha_prestamo)::int AS dias_fuera,
             p.observaciones, p.created_at::text AS created_at,
             (SELECT count(*)::int FROM almacen_prestamo_detalle x WHERE x.id_prestamo = p.id) AS total_lineas
        FROM almacen_prestamo p
        JOIN almacen a ON a.id = p.id_almacen
        JOIN anexos r ON r.id = p.id_responsable
        LEFT JOIN "CentroCostos" cc ON cc.id = p.id_centro_costo
        LEFT JOIN LATERAL (
          SELECT max(rt.fecha_retorno) AS ult FROM almacen_prestamo_retorno rt
            JOIN almacen_prestamo_detalle d ON d.id = rt.id_prestamo_detalle WHERE d.id_prestamo = p.id
        ) u ON true
       WHERE p.id = ${id}::int`;
    if (!row) throw new NotFoundException(`Préstamo ${id} no encontrado`);

    const lineas = await q.rows<PrestamoLineaResponseDto>({
      id: I,
      id_producto: I,
      codigo: T,
      descripcion: T,
      unidad: T,
      cantidad: T,
      cantidad_devuelta: T,
      cantidad_pendiente: T,
    })`
      SELECT d.id, d.id_producto, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             COALESCE(u.simbolo, u.codigo)::text AS unidad, d.cantidad::text AS cantidad,
             d.cantidad_devuelta::text AS cantidad_devuelta, (d.cantidad - d.cantidad_devuelta)::text AS cantidad_pendiente
        FROM almacen_prestamo_detalle d
        JOIN producto p ON p.id = d.id_producto
        JOIN unidad_medida u ON u.id = p.id_unidad_medida
       WHERE d.id_prestamo = ${id}::int ORDER BY d.id`;
    const retornos = await q.rows<PrestamoRetornoResponseDto>({
      id: I,
      id_prestamo_detalle: I,
      fecha_retorno: T,
      cantidad: T,
      condicion: T,
      observaciones: TN,
    })`
      SELECT r.id, r.id_prestamo_detalle, r.fecha_retorno::text AS fecha_retorno, r.cantidad::text AS cantidad,
             r.condicion::text AS condicion, r.observaciones
        FROM almacen_prestamo_retorno r JOIN almacen_prestamo_detalle d ON d.id = r.id_prestamo_detalle
       WHERE d.id_prestamo = ${id}::int ORDER BY r.id`;
    return { ...(row as unknown as PrestamoResponseDto), lineas, retornos };
  }

  // -------------------------------------------------------------- escritura

  async registrar(dto: CreatePrestamoDto): Promise<PrestamoResponseDto> {
    const ids = dto.lineas.map((l) => l.id_producto);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Hay equipos repetidos en las líneas');
    for (const l of dto.lineas) {
      if (Number(l.cantidad) <= 0) throw new BadRequestException(`La cantidad del producto ${l.id_producto} debe ser mayor a 0`);
    }

    const id = await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [alm] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM almacen WHERE id = ${dto.id_almacen}::int AND estado = true`;
      if (!alm) throw new BadRequestException(`Almacén ${dto.id_almacen} no existe o está inactivo`);
      const [resp] = await q.rows<{ id: number }>({ id: I }, tx)`
        SELECT id FROM anexos WHERE id = ${dto.id_responsable}::int AND "tipoAnexo" = 'Trabajador'`;
      if (!resp) throw new BadRequestException(`id_responsable (${dto.id_responsable}) no es un Anexo de tipo Trabajador`);
      if (dto.id_centro_costo) {
        const [cc] = await q.rows<{ id: number }>({ id: I }, tx)`SELECT id FROM "CentroCostos" WHERE id = ${dto.id_centro_costo}::int`;
        if (!cc) throw new BadRequestException(`Centro de costos ${dto.id_centro_costo} no existe`);
      }

      const numero = await this.ledger.siguienteNumero(tx, 'PRE');
      const [pre] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO almacen_prestamo
          (numero, fecha_prestamo, id_almacen, id_centro_costo, id_responsable, documento_referencia,
           dias_autorizados, fecha_prevista_retorno, observaciones)
        VALUES
          (${numero}, ${dto.fecha_prestamo}::date, ${dto.id_almacen}::int, NULLIF(${dto.id_centro_costo ?? 0}::int, 0),
           ${dto.id_responsable}::int, NULLIF(${dto.documento_referencia ?? ''}::text, ''), ${dto.dias_autorizados}::int,
           (${dto.fecha_prestamo}::date + ${dto.dias_autorizados}::int), NULLIF(${dto.observaciones ?? ''}::text, ''))
        RETURNING id`;

      const lineas = [...dto.lineas].sort((a, b) => a.id_producto - b.id_producto);
      for (const linea of lineas) {
        const prod = await this.ledger.bloquearProducto(tx, linea.id_producto);
        if (!prod.estado) throw new BadRequestException(`El producto "${prod.descripcion}" está inactivo`);
        if (prod.clase !== 'EQUIPO_RETORNABLE') {
          throw new BadRequestException(`"${prod.descripcion}" no es un equipo retornable; los préstamos solo aplican a equipos`);
        }
        await q.run(tx)`
          INSERT INTO almacen_prestamo_detalle (id_prestamo, id_producto, cantidad)
          VALUES (${pre.id}::int, ${linea.id_producto}::int, ${linea.cantidad}::numeric)`;
        await this.ledger.reservarPrestamo(tx, linea.id_producto, dto.id_almacen, linea.cantidad);
      }
      return pre.id;
    });
    return this.getById(id);
  }

  async registrarRetorno(id: number, dto: RegistrarRetornoDto): Promise<PrestamoResponseDto> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [pre] = await q.rows<{ id: number; estado: string; id_almacen: number; fecha_prestamo: string }>(
        { id: I, estado: T, id_almacen: I, fecha_prestamo: T },
        tx,
      )`SELECT id, estado::text AS estado, id_almacen, fecha_prestamo::text AS fecha_prestamo
          FROM almacen_prestamo WHERE id = ${id}::int FOR UPDATE`;
      if (!pre) throw new NotFoundException(`Préstamo ${id} no encontrado`);
      if (pre.estado === 'ANULADO' || pre.estado === 'CERRADO') {
        throw new ConflictException(`El préstamo está ${pre.estado} y no admite retornos`);
      }
      if (dto.fecha_retorno < pre.fecha_prestamo) {
        throw new BadRequestException('La fecha de retorno no puede ser anterior a la del préstamo');
      }

      const items = [...dto.retornos];
      const detalleIds = items.map((r) => r.id_prestamo_detalle);
      if (new Set(detalleIds).size !== detalleIds.length) throw new BadRequestException('Hay líneas repetidas en el retorno');

      const filas: Array<{ item: (typeof items)[number]; id_producto: number }> = [];
      for (const item of items) {
        if (Number(item.cantidad) <= 0) throw new BadRequestException('La cantidad devuelta debe ser mayor a 0');
        const [det] = await q.rows<{ id_producto: number; pendiente: string }>({ id_producto: I, pendiente: T }, tx)`
          SELECT id_producto, (cantidad - cantidad_devuelta)::text AS pendiente
            FROM almacen_prestamo_detalle WHERE id = ${item.id_prestamo_detalle}::int AND id_prestamo = ${id}::int FOR UPDATE`;
        if (!det) throw new BadRequestException(`La línea ${item.id_prestamo_detalle} no pertenece al préstamo ${id}`);
        const [ok] = await q.rows<{ ok: boolean }>({ ok: { codecId: 'pg/bool@1', nullable: false } }, tx)`
          SELECT (${item.cantidad}::numeric <= ${det.pendiente}::numeric) AS ok`;
        if (!ok.ok) {
          throw new BadRequestException(`La línea ${item.id_prestamo_detalle} solo tiene ${det.pendiente} unidades pendientes`);
        }
        filas.push({ item, id_producto: det.id_producto });
      }

      filas.sort((a, b) => a.id_producto - b.id_producto);
      for (const { item, id_producto } of filas) {
        await q.run(tx)`
          INSERT INTO almacen_prestamo_retorno (id_prestamo_detalle, fecha_retorno, cantidad, condicion, observaciones)
          VALUES (${item.id_prestamo_detalle}::int, ${dto.fecha_retorno}::date, ${item.cantidad}::numeric, ${item.condicion},
                  NULLIF(${item.observaciones ?? ''}::text, ''))`;
        await q.run(tx)`
          UPDATE almacen_prestamo_detalle SET cantidad_devuelta = cantidad_devuelta + ${item.cantidad}::numeric
           WHERE id = ${item.id_prestamo_detalle}::int`;
        await this.ledger.liberarPrestamo(
          tx,
          id_producto,
          pre.id_almacen,
          item.cantidad,
          item.condicion === 'NO_OPERATIVO' || item.condicion === 'DANADO',
        );
      }

      await q.run(tx)`
        UPDATE almacen_prestamo SET estado = (CASE WHEN NOT EXISTS (
            SELECT 1 FROM almacen_prestamo_detalle WHERE id_prestamo = ${id}::int AND cantidad_devuelta < cantidad
          ) THEN 'CERRADO' ELSE 'PARCIAL' END)
         WHERE id = ${id}::int`;
    });
    return this.getById(id);
  }

  async anular(id: number): Promise<PrestamoResponseDto> {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [pre] = await q.rows<{ estado: string; id_almacen: number }>({ estado: T, id_almacen: I }, tx)`
        SELECT estado::text AS estado, id_almacen FROM almacen_prestamo WHERE id = ${id}::int FOR UPDATE`;
      if (!pre) throw new NotFoundException(`Préstamo ${id} no encontrado`);
      if (pre.estado !== 'ABIERTO') {
        throw new ConflictException('Solo se puede anular un préstamo sin retornos; si ya hubo devoluciones, ciérrelo');
      }
      const lineas = await q.rows<{ id_producto: number; cantidad: string }>({ id_producto: I, cantidad: T }, tx)`
        SELECT id_producto, cantidad::text AS cantidad FROM almacen_prestamo_detalle WHERE id_prestamo = ${id}::int ORDER BY id_producto`;
      for (const l of lineas) {
        await this.ledger.liberarPrestamo(tx, l.id_producto, pre.id_almacen, l.cantidad, false);
      }
      await q.run(tx)`UPDATE almacen_prestamo SET estado = 'ANULADO' WHERE id = ${id}::int`;
    });
    return this.getById(id);
  }
}
