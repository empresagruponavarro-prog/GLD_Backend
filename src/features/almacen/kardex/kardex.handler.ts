import { Injectable } from '@nestjs/common';
import { pageParams, toPaginated, type Paginated } from '../../../platform/db/pagination.js';
import { AlmacenSql, I, T, TN, sqlTag } from '../shared/almacen-sql.js';
import { KardexResponseDto, ListKardexQueryDto } from './kardex.dto.js';

@Injectable()
export class KardexHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async list(query: ListKardexQueryDto): Promise<Paginated<KardexResponseDto>> {
    const { page, pageSize, offset } = pageParams(query);
    const q = sqlTag(this.sql);
    const prod = query.id_producto ?? 0;
    const alm = query.id_almacen ?? 0;
    const desde = query.desde ?? '1900-01-01';
    const hasta = query.hasta ?? '9999-12-31';

    const [count] = await q.rows<{ total: number }>({ total: I })`
      SELECT count(*)::int AS total FROM almacen_kardex k
       WHERE (${prod}::int = 0 OR k.id_producto = ${prod}::int) AND (${alm}::int = 0 OR k.id_almacen = ${alm}::int)
         AND k.fecha >= ${desde}::date AND k.fecha <= ${hasta}::date`;

    const rows = await q.rows<KardexResponseDto>({
      id: I,
      fecha: T,
      movimiento: T,
      documento: T,
      documento_referencia: TN,
      id_producto: I,
      codigo: T,
      descripcion: T,
      unidad: T,
      id_almacen: I,
      almacen: T,
      entrada: T,
      salida: T,
      saldo_almacen: T,
      saldo_total: T,
      costo_unitario: T,
      costo_total: T,
      costo_promedio: T,
      contraparte: TN,
    })`
      SELECT k.id, k.fecha::text AS fecha, k.motivo::text AS movimiento, d.numero::text AS documento,
             d.documento_referencia::text AS documento_referencia, k.id_producto, p.codigo::text AS codigo,
             p.descripcion::text AS descripcion, COALESCE(u.simbolo, u.codigo)::text AS unidad, k.id_almacen, a.nombre AS almacen,
             k.cantidad_entrada::text AS entrada, k.cantidad_salida::text AS salida,
             k.saldo_almacen::text AS saldo_almacen, k.saldo_total::text AS saldo_total,
             k.costo_unitario::text AS costo_unitario, k.costo_total::text AS costo_total, k.costo_promedio::text AS costo_promedio,
             COALESCE(pr."NombreComercial", pr."Anexo", cc.centro_costo, ad.nombre)::text AS contraparte
        FROM almacen_kardex k
        JOIN almacen_documento d ON d.id = k.id_documento
        JOIN producto p ON p.id = k.id_producto
        JOIN unidad_medida u ON u.id = p.id_unidad_medida
        JOIN almacen a ON a.id = k.id_almacen
        LEFT JOIN almacen ad ON ad.id = d.id_almacen_destino
        LEFT JOIN anexos pr ON pr.id = d.id_proveedor
        LEFT JOIN "CentroCostos" cc ON cc.id = d.id_centro_costo
       WHERE (${prod}::int = 0 OR k.id_producto = ${prod}::int) AND (${alm}::int = 0 OR k.id_almacen = ${alm}::int)
         AND k.fecha >= ${desde}::date AND k.fecha <= ${hasta}::date
       ORDER BY k.id
       LIMIT ${pageSize}::int OFFSET ${offset}::int`;
    return toPaginated(rows, count.total, page, pageSize);
  }
}
