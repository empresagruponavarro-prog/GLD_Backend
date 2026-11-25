import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../../platform/auth/jwt/auth-user.js';
import { DB, type Database } from '../../../prisma/prisma.module.js';
import { AlmacenSql, I, IN, T, TN, sqlTag, type Tx } from '../../almacen/shared/almacen-sql.js';
import { redondear2 } from '../shared/cuota.js';
import { leerContrato, leerDeductivos, leerDocumento, type ContratoFila } from '../shared/datos.js';
import { m2 } from '../shared/serializar.js';
import type { AnularDeductivoDto, CreateDeductivoDto } from './deductivos.dto.js';

@Injectable()
export class DeductivosHandler {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sql: AlmacenSql,
  ) {}

  async listar(idContrato: number) {
    const c = await this.contrato(idContrato);
    const lista = await leerDeductivos(this.sql, c.id_documento_origen);
    return lista.map((d) => ({ ...d, monto: m2(d.monto), aplicado: m2(d.aplicado), pendiente: m2(d.pendiente), cantidad: d.cantidad === null ? null : String(d.cantidad) }));
  }

  /** Líneas de PECOSA (salidas de consumo) de la obra del contrato, con lo que ya se cobró de cada una: lo que se puede descontar al contratista. */
  async materiales(idContrato: number) {
    const c = await this.contrato(idContrato);
    const doc = await leerDocumento(this.sql, c.id_documento_origen);
    if (!doc?.id_centro_costo) return [];
    const q = sqlTag(this.sql);
    const filas = await q.rows<Record<string, string | number | null>>(
      { id: I, documento: T, fecha: T, producto: TN, cantidad: T, costo_unitario: T, cobrado: T },
    )`
      SELECT l.id, d.numero::text AS documento, d.fecha::text AS fecha, p.descripcion::text AS producto, l.cantidad::text AS cantidad,
             COALESCE(l.costo_unitario, 0)::text AS costo_unitario,
             COALESCE((SELECT SUM(x.cantidad) FROM deductivo_proveedor x WHERE x.id_almacen_detalle = l.id AND x.estado::text <> 'ANULADO'), 0)::text AS cobrado
        FROM almacen_documento_detalle l
        JOIN almacen_documento d ON d.id = l.id_documento
        JOIN producto p ON p.id = l.id_producto
       WHERE d.id_centro_costo = ${doc.id_centro_costo}::int AND d.naturaleza::text = 'SALIDA' AND d.motivo::text = 'CONSUMO' AND d.estado::text <> 'ANULADO'
       ORDER BY d.fecha DESC, l.id`;
    return filas.map((f) => {
      const cantidad = Number(f['cantidad']);
      const cobrado = Number(f['cobrado']);
      return {
        id_almacen_detalle: f['id'] as number,
        documento: f['documento'],
        fecha: f['fecha'],
        producto: f['producto'],
        cantidad: String(cantidad),
        costo_unitario: m2(Number(f['costo_unitario'])),
        cobrado: String(cobrado),
        saldo: String(Math.max(redondear2(cantidad - cobrado), 0)),
      };
    });
  }

  async crear(idContrato: number, dto: CreateDeductivoDto, user?: AuthUser) {
    const quien = user?.usuario ?? 'SISTEMA';
    const id = await this.db.transaction(async (tx) => {
      const c = await this.contrato(idContrato, tx);
      if (c.estado === 'ANULADO') throw new ConflictException('El contrato está anulado');
      const doc = await leerDocumento(this.sql, c.id_documento_origen, tx);
      if (!doc) throw new NotFoundException('La orden del contrato no existe');
      const q = sqlTag(this.sql);
      let monto = dto.monto;
      let cantidad: number | null = null;
      let idAlmacen: number | null = null;
      let idIncidencia: number | null = null;

      if (dto.motivo === 'MATERIAL') {
        if (dto.id_almacen_detalle === undefined || dto.cantidad === undefined) {
          throw new BadRequestException('Un deductivo por material necesita la línea de la PECOSA (id_almacen_detalle) y la cantidad');
        }
        const [l] = await q.rows<Record<string, string | number | null>>({ cantidad: T, costo: T, cc: IN, estado: T, naturaleza: T, motivo: T, cobrado: T }, tx)`
          SELECT l.cantidad::text AS cantidad, COALESCE(l.costo_unitario, 0)::text AS costo, d.id_centro_costo AS cc, d.estado::text AS estado,
                 d.naturaleza::text AS naturaleza, d.motivo::text AS motivo,
                 COALESCE((SELECT SUM(x.cantidad) FROM deductivo_proveedor x WHERE x.id_almacen_detalle = l.id AND x.estado::text <> 'ANULADO'), 0)::text AS cobrado
            FROM almacen_documento_detalle l JOIN almacen_documento d ON d.id = l.id_documento
           WHERE l.id = ${dto.id_almacen_detalle}::int FOR UPDATE OF l`;
        if (!l) throw new BadRequestException(`La línea ${dto.id_almacen_detalle} de almacén no existe`);
        if (l['naturaleza'] !== 'SALIDA' || l['motivo'] !== 'CONSUMO' || l['estado'] === 'ANULADO') throw new BadRequestException('La línea debe ser de una salida de consumo vigente');
        if (l['cc'] !== doc.id_centro_costo) throw new BadRequestException('La salida es de otra obra: solo se cobra material entregado a la obra del contrato');
        const saldo = redondear2(Number(l['cantidad']) - Number(l['cobrado']));
        if (dto.cantidad > saldo + 0.00005) throw new ConflictException(`Solo quedan ${saldo} por cobrar de esa línea (entregado ${l['cantidad']}, ya cobrado ${l['cobrado']})`);
        cantidad = dto.cantidad;
        idAlmacen = dto.id_almacen_detalle;
        monto = redondear2(dto.cantidad * Number(l['costo']));
        if (monto <= 0) throw new BadRequestException('La línea no tiene costo: no se puede valorizar el material');
      } else {
        if (monto === undefined) throw new BadRequestException('Indique el monto del deductivo');
        if (dto.motivo === 'INCIDENCIA' && dto.id_obra_incidencia !== undefined) {
          const [inc] = await q.rows<{ cc: number }>({ cc: I }, tx)`SELECT id_centro_costo AS cc FROM obra_incidencias_rfi WHERE id = ${dto.id_obra_incidencia}::int`;
          if (!inc) throw new BadRequestException(`La incidencia ${dto.id_obra_incidencia} no existe`);
          if (inc.cc !== doc.id_centro_costo) throw new BadRequestException('La incidencia es de otra obra');
          idIncidencia = dto.id_obra_incidencia;
        }
      }

      const [fila] = await q.rows<{ id: number }>({ id: I }, tx)`
        INSERT INTO deductivo_proveedor (id_documento_origen, motivo, fecha, descripcion, monto, estado, id_almacen_detalle, cantidad, id_obra_incidencia, sustento_url, registrado_por)
        VALUES (${doc.id}::int, ${dto.motivo}::text, ${dto.fecha}::date, ${dto.descripcion}::text, ${String(monto)}::numeric, 'PENDIENTE', NULLIF(${idAlmacen ?? 0}::int, 0),
                NULLIF(${cantidad === null ? '' : String(cantidad)}::text, '')::numeric, NULLIF(${idIncidencia ?? 0}::int, 0), NULLIF(${dto.sustento_url ?? ''}::text, ''), ${quien}::text)
        RETURNING id`;
      return fila.id;
    });
    const c = await this.contrato(idContrato);
    const d = (await leerDeductivos(this.sql, c.id_documento_origen)).find((x) => x.id === id)!;
    return { ...d, monto: m2(d.monto), aplicado: m2(d.aplicado), pendiente: m2(d.pendiente), cantidad: d.cantidad === null ? null : String(d.cantidad) };
  }

  /** Se anula un deductivo que todavía no descontó nada: lo ya descontado se corrige anulando la valorización. */
  async anular(id: number, dto: AnularDeductivoDto) {
    await this.db.transaction(async (tx) => {
      const q = sqlTag(this.sql);
      const [d] = await q.rows<{ estado: string; aplicado: string }>({ estado: T, aplicado: T }, tx)`
        SELECT estado::text AS estado, COALESCE((SELECT SUM(a.monto) FROM valorizacion_deductivo a WHERE a.id_deductivo = deductivo_proveedor.id), 0)::text AS aplicado
          FROM deductivo_proveedor WHERE id = ${id}::int FOR UPDATE`;
      if (!d) throw new NotFoundException(`Deductivo ${id} no encontrado`);
      if (d.estado === 'ANULADO') throw new ConflictException('El deductivo ya está anulado');
      if (Number(d.aplicado) > 0) throw new ConflictException('El deductivo ya se descontó en una valorización: anule esa valorización primero');
      await q.run(tx)`UPDATE deductivo_proveedor SET estado = 'ANULADO', motivo_anulacion = ${dto.motivo}::text WHERE id = ${id}::int`;
    });
    return { id, estado: 'ANULADO' };
  }

  private async contrato(id: number, tx?: Tx): Promise<ContratoFila> {
    const c = await leerContrato(this.sql, id, tx);
    if (!c) throw new NotFoundException(`Contrato ${id} no encontrado`);
    return c;
  }
}
