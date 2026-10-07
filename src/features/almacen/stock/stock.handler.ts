import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, T, TN, sqlTag } from '../shared/almacen-sql.js';
import { InventarioLedger } from '../shared/inventario-ledger.js';
import { ListStockQueryDto, MarcarOperativoDto, StockResponseDto } from './stock.dto.js';

const SPEC = {
  id_producto: I,
  codigo: T,
  descripcion: T,
  unidad: T,
  categoria: T,
  familia: TN,
  clase_inventario: T,
  almacen_default: TN,
  stock_total: T,
  prestado: T,
  no_operativo: T,
  disponible: T,
  stock_minimo: T,
  stock_objetivo: T,
  compra_sugerida: T,
  costo_promedio: T,
  valor_total: T,
  alerta: T,
  total_rows: I,
} as const;

@Injectable()
export class StockHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
    private readonly ledger: InventarioLedger,
  ) {}

  list(query: ListStockQueryDto): Promise<Paginated<StockResponseDto>> {
    return this.consultar(query, false);
  }

  compraSugerida(query: ListStockQueryDto): Promise<Paginated<StockResponseDto>> {
    return this.consultar(query, true);
  }

  async marcarOperativo(idProducto: number, idAlmacen: number, dto: MarcarOperativoDto): Promise<void> {
    if (Number(dto.cantidad) <= 0) throw new BadRequestException('La cantidad debe ser mayor a 0');
    await this.db.transaction((tx) => this.ledger.marcarOperativo(tx, idProducto, idAlmacen, dto.cantidad));
  }

  private async consultar(query: ListStockQueryDto, soloSugeridos: boolean): Promise<Paginated<StockResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const q = sqlTag(this.sql);
    const alm = query.id_almacen ?? 0;
    const cat = query.id_categoria ?? 0;
    const fam = query.id_familia ?? 0;
    const clase = query.clase_inventario ?? '';
    const alerta = query.alerta ?? '';
    const texto = query.q ? `%${query.q}%` : '';
    const incluirTodo = query.incluir_sin_stock === true;

    const rows = await q.rows<Record<string, unknown> & { total_rows: number }>(SPEC)`
      SELECT t.*, count(*) OVER()::int AS total_rows FROM (
        SELECT x.id_producto, x.codigo, x.descripcion, x.unidad, x.categoria, x.familia, x.clase_inventario, x.almacen_default,
               x.stock_total::text AS stock_total, x.prestado::text AS prestado, x.no_operativo::text AS no_operativo,
               x.disponible::text AS disponible, x.stock_minimo::text AS stock_minimo, x.stock_objetivo::text AS stock_objetivo,
               x.compra_sugerida::text AS compra_sugerida, x.costo_promedio::text AS costo_promedio,
               round(x.stock_total * x.costo_promedio, 2)::text AS valor_total,
               (CASE WHEN x.disponible <= 0 THEN 'SIN_STOCK'
                     WHEN x.no_operativo > 0 THEN 'EQUIPO_NO_OPERATIVO'
                     WHEN x.stock_minimo > 0 AND x.disponible <= x.stock_minimo THEN 'BAJO_MINIMO'
                     ELSE 'OK' END)::text AS alerta
          FROM (
            SELECT p.id AS id_producto, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
                   COALESCE(u.simbolo, u.codigo)::text AS unidad, c.codigo::text AS categoria, f.prefijo::text AS familia,
                   p.clase_inventario::text AS clase_inventario, ad.nombre::text AS almacen_default,
                   COALESCE(s.cant, 0) AS stock_total, COALESCE(s.pres, 0) AS prestado, COALESCE(s.nop, 0) AS no_operativo,
                   COALESCE(s.cant, 0) - COALESCE(s.pres, 0) - COALESCE(s.nop, 0) AS disponible,
                   p.stock_minimo, p.stock_objetivo, p.costo_promedio,
                   (CASE WHEN p.clase_inventario = 'EQUIPO_RETORNABLE' THEN 0
                         WHEN COALESCE(s.cant, 0) - COALESCE(s.pres, 0) - COALESCE(s.nop, 0) <= p.stock_minimo
                         THEN GREATEST(0, p.stock_objetivo - (COALESCE(s.cant, 0) - COALESCE(s.pres, 0) - COALESCE(s.nop, 0)))
                         ELSE 0 END) AS compra_sugerida
              FROM producto p
              JOIN unidad_medida u ON u.id = p.id_unidad_medida
              JOIN categoria c ON c.id = p.id_categoria
              LEFT JOIN familia_almacen f ON f.id = p.id_familia
              LEFT JOIN almacen ad ON ad.id = p.id_almacen_default
              LEFT JOIN (
                SELECT id_producto, sum(cantidad) AS cant, sum(cantidad_prestada) AS pres, sum(cantidad_no_operativa) AS nop
                  FROM stock_almacen WHERE (${alm}::int = 0 OR id_almacen = ${alm}::int) GROUP BY id_producto
              ) s ON s.id_producto = p.id
             WHERE p.tipo_producto = 'PRODUCTO' AND p.estado = true
               AND (${soloSugeridos}::boolean = false OR p.estado_operativo <> 'DESCONTINUADO')
               AND (${cat}::int = 0 OR p.id_categoria = ${cat}::int)
               AND (${fam}::int = 0 OR p.id_familia = ${fam}::int)
               AND (${clase}::text = '' OR p.clase_inventario = ${clase}::text)
               AND (${texto}::text = '' OR p.codigo ILIKE ${texto}::text OR p.descripcion ILIKE ${texto}::text)
               AND (${incluirTodo}::boolean OR ${soloSugeridos}::boolean OR COALESCE(s.cant, 0) <> 0 OR COALESCE(s.pres, 0) <> 0 OR p.stock_minimo > 0)
          ) x
      ) t
       WHERE (${alerta}::text = '' OR t.alerta = ${alerta}::text)
         AND (${soloSugeridos}::boolean = false OR t.compra_sugerida::numeric > 0)
       ORDER BY t.descripcion, t.id_producto
       LIMIT ${pageSize}::int OFFSET ${offset}::int`;

    const total = rows.length > 0 ? rows[0].total_rows : 0;
    const data = rows.map(({ total_rows: _t, ...rest }) => rest) as unknown as StockResponseDto[];
    return toPaginated(data, total, page, pageSize);
  }
}
