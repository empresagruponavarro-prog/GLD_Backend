import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AlmacenSql, I, T, sqlTag, type Tx } from './almacen-sql.js';

export type MotivoMovimiento =
  | 'INVENTARIO_INICIAL'
  | 'COMPRA'
  | 'DEVOLUCION'
  | 'INGRESO_CLIENTE'
  | 'AJUSTE_POSITIVO'
  | 'CONSUMO'
  | 'VENTA'
  | 'BAJA'
  | 'AJUSTE_NEGATIVO'
  | 'TRANSFERENCIA';

export interface Movimiento {
  idProducto: number;
  idAlmacen: number;
  /** Cantidad positiva como string decimal. */
  cantidad: string;
  /** Fecha de negocio `YYYY-MM-DD`. */
  fecha: string;
  idDocumento: number;
  idDocumentoDetalle: number;
  motivo: MotivoMovimiento;
}

export interface IngresoInput extends Movimiento {
  /** Costo unitario de la linea; si es nulo se usa el promedio vigente. */
  costo: string | null;
}

export interface EgresoInput extends Movimiento {
  /**
   * Solo al revertir un ingreso: costo con el que entro. Quita ese aporte del
   * promedio. En una salida normal es nulo y el promedio no cambia.
   */
  costoReversa?: string | null;
}

export interface ProductoBloqueado {
  descripcion: string;
  stock: string;
  costo: string;
  clase: string;
  tipo: string;
  estado: boolean;
  estadoOperativo: string;
}

/**
 * Motor unico de inventario. Toda mutacion de stock pasa por aqui y se ejecuta
 * dentro de la transaccion del llamador (`tx`). Concurrencia: cada movimiento
 * toma `FOR UPDATE` sobre el producto (serializa stock total y costo) y las
 * salidas descuentan con un UPDATE condicional atomico.
 */
@Injectable()
export class InventarioLedger {
  constructor(private readonly sql: AlmacenSql) {}

  async siguienteNumero(tx: Tx, serie: string): Promise<string> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<{ ultimo: number }>({ ultimo: I }, tx)`
      UPDATE almacen_correlativo SET ultimo = ultimo + 1 WHERE serie = ${serie} RETURNING ultimo`;
    if (!row) throw new NotFoundException(`Serie de correlativo "${serie}" no configurada`);
    return `${serie}-${String(row.ultimo).padStart(6, '0')}`;
  }

  async bloquearProducto(tx: Tx, idProducto: number): Promise<ProductoBloqueado> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<{
      descripcion: string;
      stock: string;
      costo: string;
      clase: string;
      tipo: string;
      estado: string;
      estado_operativo: string;
    }>(
      {
        descripcion: T,
        stock: T,
        costo: T,
        clase: T,
        tipo: T,
        estado: T,
        estado_operativo: T,
      },
      tx,
    )`SELECT descripcion, stock::text AS stock, costo_promedio::text AS costo,
             clase_inventario::text AS clase, tipo_producto::text AS tipo, estado::text AS estado,
             estado_operativo::text AS estado_operativo
        FROM producto WHERE id = ${idProducto} FOR UPDATE`;
    if (!row) throw new NotFoundException(`Producto ${idProducto} no encontrado`);
    return {
      descripcion: row.descripcion,
      stock: row.stock,
      costo: row.costo,
      clase: row.clase,
      tipo: row.tipo,
      estado: row.estado === 'true',
      estadoOperativo: row.estado_operativo,
    };
  }

  async registrarIngreso(tx: Tx, m: IngresoInput): Promise<{ saldoAlmacen: string; saldoTotal: string; promedio: string; costo: string }> {
    const q = sqlTag(this.sql);
    const prod = await this.bloquearProducto(tx, m.idProducto);
    const costo = m.costo ?? prod.costo;

    const [calc] = await q.rows<{ promedio: string; total: string }>({ promedio: T, total: T }, tx)`
      SELECT
        (CASE WHEN ${prod.stock}::numeric + ${m.cantidad}::numeric > 0
              THEN round((${prod.stock}::numeric * ${prod.costo}::numeric + ${m.cantidad}::numeric * ${costo}::numeric)
                         / (${prod.stock}::numeric + ${m.cantidad}::numeric), 6)
              ELSE ${costo}::numeric END)::text AS promedio,
        (${prod.stock}::numeric + ${m.cantidad}::numeric)::text AS total`;

    const [stock] = await q.rows<{ cantidad: string }>({ cantidad: T }, tx)`
      INSERT INTO stock_almacen (id_producto, id_almacen, cantidad)
      VALUES (${m.idProducto}, ${m.idAlmacen}, ${m.cantidad}::numeric)
      ON CONFLICT (id_producto, id_almacen)
      DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now()
      RETURNING cantidad::text AS cantidad`;

    await q.run(tx)`
      UPDATE producto SET stock = ${calc.total}::numeric, costo_promedio = ${calc.promedio}::numeric
      WHERE id = ${m.idProducto}`;

    await this.insertarKardex(tx, m, {
      entrada: m.cantidad,
      salida: '0',
      costo,
      saldoAlmacen: stock.cantidad,
      saldoTotal: calc.total,
      promedio: calc.promedio,
    });
    return { saldoAlmacen: stock.cantidad, saldoTotal: calc.total, promedio: calc.promedio, costo };
  }

  async registrarEgreso(tx: Tx, m: EgresoInput): Promise<{ saldoAlmacen: string; saldoTotal: string; promedio: string; costo: string }> {
    const q = sqlTag(this.sql);
    const prod = await this.bloquearProducto(tx, m.idProducto);
    const hayReversa = m.costoReversa !== undefined && m.costoReversa !== null;
    const rev = m.costoReversa ?? '0';
    const costo = hayReversa ? rev : prod.costo;

    // Descuento atomico: solo si el disponible alcanza.
    const [stock] = await q.rows<{ cantidad: string }>({ cantidad: T }, tx)`
      UPDATE stock_almacen
         SET cantidad = cantidad - ${m.cantidad}::numeric, updated_at = now()
       WHERE id_producto = ${m.idProducto} AND id_almacen = ${m.idAlmacen}
         AND cantidad - cantidad_prestada - cantidad_no_operativa >= ${m.cantidad}::numeric
      RETURNING cantidad::text AS cantidad`;
    if (!stock) {
      const disponible = await this.disponible(tx, m.idProducto, m.idAlmacen);
      throw new ConflictException(
        `Stock insuficiente para "${prod.descripcion}": disponible ${disponible}, solicitado ${m.cantidad}`,
      );
    }

    const [calc] = await q.rows<{ promedio: string; total: string }>({ promedio: T, total: T }, tx)`
      SELECT
        (CASE WHEN ${hayReversa}::boolean AND ${prod.stock}::numeric - ${m.cantidad}::numeric > 0
              THEN GREATEST(0, round((${prod.stock}::numeric * ${prod.costo}::numeric - ${m.cantidad}::numeric * ${rev}::numeric)
                         / (${prod.stock}::numeric - ${m.cantidad}::numeric), 6))
              ELSE ${prod.costo}::numeric END)::text AS promedio,
        (${prod.stock}::numeric - ${m.cantidad}::numeric)::text AS total`;

    await q.run(tx)`
      UPDATE producto SET stock = ${calc.total}::numeric, costo_promedio = ${calc.promedio}::numeric
      WHERE id = ${m.idProducto}`;

    await this.insertarKardex(tx, m, {
      entrada: '0',
      salida: m.cantidad,
      costo,
      saldoAlmacen: stock.cantidad,
      saldoTotal: calc.total,
      promedio: calc.promedio,
    });
    return { saldoAlmacen: stock.cantidad, saldoTotal: calc.total, promedio: calc.promedio, costo };
  }

  /** Salida en origen + ingreso en destino al costo promedio vigente. */
  async registrarTransferencia(
    tx: Tx,
    m: Movimiento & { idAlmacenDestino: number },
  ): Promise<{ costo: string }> {
    const salida = await this.registrarEgreso(tx, { ...m, motivo: 'TRANSFERENCIA' });
    await this.registrarIngreso(tx, {
      ...m,
      idAlmacen: m.idAlmacenDestino,
      motivo: 'TRANSFERENCIA',
      costo: salida.costo,
    });
    return { costo: salida.costo };
  }

  async disponible(tx: Tx, idProducto: number, idAlmacen: number): Promise<string> {
    const q = sqlTag(this.sql);
    const [row] = await q.rows<{ disponible: string }>({ disponible: T }, tx)`
      SELECT COALESCE((SELECT (cantidad - cantidad_prestada - cantidad_no_operativa)::text
                         FROM stock_almacen WHERE id_producto = ${idProducto} AND id_almacen = ${idAlmacen}), '0') AS disponible`;
    return row.disponible;
  }

  /** Reserva unidades como prestadas (reduce disponible, no el stock total). */
  async reservarPrestamo(tx: Tx, idProducto: number, idAlmacen: number, cantidad: string): Promise<void> {
    const q = sqlTag(this.sql);
    await this.bloquearProducto(tx, idProducto);
    const n = await q.run(tx)`
      UPDATE stock_almacen SET cantidad_prestada = cantidad_prestada + ${cantidad}::numeric, updated_at = now()
       WHERE id_producto = ${idProducto} AND id_almacen = ${idAlmacen}
         AND cantidad - cantidad_prestada - cantidad_no_operativa >= ${cantidad}::numeric`;
    if (n === 0) {
      const disponible = await this.disponible(tx, idProducto, idAlmacen);
      throw new ConflictException(
        `Stock insuficiente para prestar el producto ${idProducto}: disponible ${disponible}, solicitado ${cantidad}`,
      );
    }
  }

  /** Libera unidades prestadas; las no operativas pasan a `cantidad_no_operativa`. */
  async liberarPrestamo(
    tx: Tx,
    idProducto: number,
    idAlmacen: number,
    cantidad: string,
    noOperativo: boolean,
  ): Promise<void> {
    const q = sqlTag(this.sql);
    await this.bloquearProducto(tx, idProducto);
    const n = await q.run(tx)`
      UPDATE stock_almacen
         SET cantidad_prestada = cantidad_prestada - ${cantidad}::numeric,
             cantidad_no_operativa = cantidad_no_operativa + (CASE WHEN ${noOperativo} THEN ${cantidad}::numeric ELSE 0 END),
             updated_at = now()
       WHERE id_producto = ${idProducto} AND id_almacen = ${idAlmacen}
         AND cantidad_prestada >= ${cantidad}::numeric`;
    if (n === 0) throw new ConflictException(`No hay ${cantidad} unidades prestadas del producto ${idProducto}`);
  }

  /** Devuelve unidades no operativas a disponibles. */
  async marcarOperativo(tx: Tx, idProducto: number, idAlmacen: number, cantidad: string): Promise<void> {
    const q = sqlTag(this.sql);
    await this.bloquearProducto(tx, idProducto);
    const n = await q.run(tx)`
      UPDATE stock_almacen SET cantidad_no_operativa = cantidad_no_operativa - ${cantidad}::numeric, updated_at = now()
       WHERE id_producto = ${idProducto} AND id_almacen = ${idAlmacen}
         AND cantidad_no_operativa >= ${cantidad}::numeric`;
    if (n === 0) throw new ConflictException(`No hay ${cantidad} unidades no operativas del producto ${idProducto}`);
  }

  private async insertarKardex(
    tx: Tx,
    m: Movimiento,
    k: { entrada: string; salida: string; costo: string; saldoAlmacen: string; saldoTotal: string; promedio: string },
  ): Promise<void> {
    const q = sqlTag(this.sql);
    await q.run(tx)`
      INSERT INTO almacen_kardex
        (fecha, id_producto, id_almacen, id_documento, id_documento_detalle, motivo,
         cantidad_entrada, cantidad_salida, costo_unitario, costo_total, saldo_almacen, saldo_total, costo_promedio)
      VALUES
        (${m.fecha}::date, ${m.idProducto}, ${m.idAlmacen}, ${m.idDocumento}, ${m.idDocumentoDetalle}, ${m.motivo},
         ${k.entrada}::numeric, ${k.salida}::numeric, ${k.costo}::numeric,
         round((${k.entrada}::numeric + ${k.salida}::numeric) * ${k.costo}::numeric, 6),
         ${k.saldoAlmacen}::numeric, ${k.saldoTotal}::numeric, ${k.promedio}::numeric)`;
  }
}
