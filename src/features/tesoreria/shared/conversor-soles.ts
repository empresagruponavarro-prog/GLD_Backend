import { AlmacenSql } from '../../almacen/shared/almacen-sql.js';
import { claveMoneda, tcVigente } from './tipo-cambio.js';
import { esSoles } from './tributos.js';

/**
 * Convierte importes a soles con el tipo de cambio de venta vigente a una fecha (el del dia o el ultimo anterior).
 * Cuenta cuantos importes no pudieron convertirse por falta de tipo de cambio.
 */
export class ConversorSoles {
  private readonly cache = new Map<string, number | null>();
  sinTipoCambio = 0;

  constructor(private readonly sql: AlmacenSql) {}

  async aSoles(
    monto: number,
    monedaId: string | null | undefined,
    simbolo: string | null | undefined,
    fecha: string,
  ): Promise<number> {
    if (esSoles(monedaId, simbolo)) return monto;
    const clave = claveMoneda(monedaId, simbolo);
    const key = `${clave}|${fecha}`;
    if (!this.cache.has(key)) {
      const tc = await tcVigente(this.sql, clave, fecha);
      this.cache.set(key, tc ? Number(tc.venta) : null);
    }
    const tc = this.cache.get(key) ?? null;
    if (tc === null) {
      this.sinTipoCambio++;
      return 0;
    }
    return monto * tc;
  }
}
