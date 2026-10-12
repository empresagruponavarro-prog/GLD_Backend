import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlmacenSql, I, T, sqlTag } from '../../almacen/shared/almacen-sql.js';
import { tcVigente, type TipoCambioVigente } from '../shared/tipo-cambio.js';
import { ListTipoCambioQueryDto, TipoCambioResponseDto, UpsertTipoCambioDto } from '../tesoreria.dto.js';

const SPEC = { id: I, fecha: T, moneda_id: T, compra: T, venta: T } as const;

@Injectable()
export class TipoCambioHandler {
  constructor(private readonly sql: AlmacenSql) {}

  async list(query: ListTipoCambioQueryDto): Promise<TipoCambioResponseDto[]> {
    const q = sqlTag(this.sql);
    const desde = query.desde ?? '1900-01-01';
    const hasta = query.hasta ?? '9999-12-31';
    const moneda = (query.moneda ?? '').toUpperCase();
    return q.rows<TipoCambioResponseDto>(SPEC)`
      SELECT id, fecha::text AS fecha, moneda_id::text AS moneda_id, compra::text AS compra, venta::text AS venta
        FROM tipo_cambio_diario
       WHERE fecha >= ${desde}::date AND fecha <= ${hasta}::date AND (${moneda}::text = '' OR moneda_id = ${moneda}::text)
       ORDER BY fecha DESC, moneda_id LIMIT 500`;
  }

  /** Tipo de cambio de la fecha (o el ultimo anterior); 404 si nunca se registro uno. */
  async vigente(moneda: string, fecha?: string): Promise<TipoCambioVigente> {
    const dia = fecha ?? new Date().toISOString().slice(0, 10);
    const tc = await tcVigente(this.sql, moneda.toUpperCase(), dia);
    if (!tc) throw new NotFoundException(`No hay tipo de cambio registrado para ${moneda.toUpperCase()} hasta el ${dia}`);
    return tc;
  }

  async upsert(dto: UpsertTipoCambioDto): Promise<TipoCambioResponseDto> {
    const compra = Number(dto.compra);
    const venta = Number(dto.venta);
    if (compra <= 0 || venta <= 0) throw new BadRequestException('Compra y venta deben ser mayores a 0');
    if (venta < compra) throw new BadRequestException('El tipo de cambio de venta no puede ser menor al de compra');
    const q = sqlTag(this.sql);
    const [row] = await q.rows<TipoCambioResponseDto>(SPEC)`
      INSERT INTO tipo_cambio_diario (fecha, moneda_id, compra, venta)
      VALUES (${dto.fecha}::date, ${dto.moneda_id.toUpperCase()}::text, ${dto.compra}::numeric, ${dto.venta}::numeric)
      ON CONFLICT (fecha, moneda_id) DO UPDATE SET compra = EXCLUDED.compra, venta = EXCLUDED.venta
      RETURNING id, fecha::text AS fecha, moneda_id::text AS moneda_id, compra::text AS compra, venta::text AS venta`;
    return row;
  }
}
