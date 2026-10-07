import { Injectable } from '@nestjs/common';
import { AlmacenSql, I, T, TN, sqlTag } from '../shared/almacen-sql.js';
import { StockAlmacenResponseDto } from '../stock/stock.dto.js';
import {
  ConsultaAlternativaDto,
  ConsultaCoincidenciaDto,
  ConsultaFichaDto,
  ConsultaResponseDto,
} from './consulta.dto.js';

@Injectable()
export class ConsultaHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async buscar(texto: string): Promise<ConsultaResponseDto> {
    const q = sqlTag(this.sql);
    const termino = texto.trim();
    const patron = `%${termino}%`;

    // Prioridad: codigo exacto (sin distinguir mayusculas); si no, descripcion parcial.
    const candidatos = await q.rows<ConsultaCoincidenciaDto>({ id: I, codigo: T, descripcion: T })`
      SELECT id, codigo::text AS codigo, descripcion::text AS descripcion
        FROM producto
       WHERE tipo_producto = 'PRODUCTO' AND estado = true
         AND (upper(codigo) = upper(${termino}::text) OR descripcion ILIKE ${patron}::text OR codigo ILIKE ${patron}::text)
       ORDER BY (upper(codigo) = upper(${termino}::text)) DESC, descripcion
       LIMIT 10`;

    const exacto = candidatos.find((c) => c.codigo.toUpperCase() === termino.toUpperCase());
    const elegido = exacto ?? (candidatos.length === 1 ? candidatos[0] : undefined);
    if (!elegido) {
      return { producto: null, coincidencias: candidatos, stock_por_almacen: [], alternativas: [] };
    }

    const [ficha] = await q.rows<ConsultaFichaDto>({
      id: I,
      codigo: T,
      descripcion: T,
      categoria: T,
      familia: TN,
      uso_principal: TN,
      unidad: T,
      clase_inventario: T,
      estado_operativo: T,
      almacen_default: TN,
      stock_total: T,
      disponible: T,
      stock_minimo: T,
      stock_objetivo: T,
      costo_promedio: T,
    })`
      SELECT p.id, p.codigo::text AS codigo, p.descripcion::text AS descripcion, c.codigo::text AS categoria,
             f.prefijo::text AS familia, p.uso_principal, COALESCE(u.simbolo, u.codigo)::text AS unidad,
             p.clase_inventario::text AS clase_inventario, p.estado_operativo::text AS estado_operativo,
             ad.nombre::text AS almacen_default,
             COALESCE((SELECT sum(cantidad) FROM stock_almacen WHERE id_producto = p.id), 0)::text AS stock_total,
             COALESCE((SELECT sum(cantidad - cantidad_prestada - cantidad_no_operativa) FROM stock_almacen WHERE id_producto = p.id), 0)::text AS disponible,
             p.stock_minimo::text AS stock_minimo, p.stock_objetivo::text AS stock_objetivo, p.costo_promedio::text AS costo_promedio
        FROM producto p
        JOIN categoria c ON c.id = p.id_categoria
        JOIN unidad_medida u ON u.id = p.id_unidad_medida
        LEFT JOIN familia_almacen f ON f.id = p.id_familia
        LEFT JOIN almacen ad ON ad.id = p.id_almacen_default
       WHERE p.id = ${elegido.id}::int`;

    const porAlmacen = await q.rows<StockAlmacenResponseDto>({
      id_almacen: I,
      almacen: T,
      cantidad: T,
      prestado: T,
      no_operativo: T,
      disponible: T,
    })`
      SELECT s.id_almacen, a.nombre AS almacen, s.cantidad::text AS cantidad, s.cantidad_prestada::text AS prestado,
             s.cantidad_no_operativa::text AS no_operativo,
             (s.cantidad - s.cantidad_prestada - s.cantidad_no_operativa)::text AS disponible
        FROM stock_almacen s JOIN almacen a ON a.id = s.id_almacen
       WHERE s.id_producto = ${elegido.id}::int AND (s.cantidad <> 0 OR s.cantidad_prestada <> 0 OR s.cantidad_no_operativa <> 0)
       ORDER BY a.nombre`;

    const alternativas = await q.rows<ConsultaAlternativaDto>({
      prioridad: I,
      id_producto: I,
      codigo: T,
      descripcion: T,
      disponible: T,
      costo_promedio: T,
    })`
      SELECT a.prioridad, p.id AS id_producto, p.codigo::text AS codigo, p.descripcion::text AS descripcion,
             COALESCE((SELECT sum(cantidad - cantidad_prestada - cantidad_no_operativa) FROM stock_almacen WHERE id_producto = p.id), 0)::text AS disponible,
             p.costo_promedio::text AS costo_promedio
        FROM producto_alternativa a JOIN producto p ON p.id = a.id_producto_alternativo
       WHERE a.id_producto = ${elegido.id}::int ORDER BY a.prioridad`;

    return { producto: ficha, coincidencias: [], stock_por_almacen: porAlmacen, alternativas };
  }
}
