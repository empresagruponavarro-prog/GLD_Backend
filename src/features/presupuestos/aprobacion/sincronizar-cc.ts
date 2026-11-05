import { toDecimalString, toVarchar } from '../../../platform/db/varchar-helpers.js';
import type { Database } from '../../../prisma/prisma.module.js';
import { ESTADOS_APROBADOS, estadoMasAvanzado, textoEstadoCc, type EstadoPpto } from './estados.js';

type Orm = Database['orm']['public'];

export interface PresupuestoParaCc {
  estado: EstadoPpto;
  costoDirecto: number;
  /** Suma del costo directo de sus fases (respaldo cuando la cabecera del presupuesto quedó atrás). */
  costoFases: number;
}

export interface ResumenCc {
  monto: number;
  estado: EstadoPpto | null;
}

/**
 * Lo que el centro de costo muestra de sus presupuestos (GRP DG15). Los anulados no cuentan. El monto es la suma de
 * los presupuestos aprobados (Principales y adicionales) o, si todavía no hay ninguno, de los vigentes; el estado, el
 * más avanzado entre los vigentes. Puro: se prueba sin base de datos.
 */
export function calcularResumenCc(pptos: readonly PresupuestoParaCc[]): ResumenCc {
  const vigentes = pptos.filter((p) => p.estado !== 'ANULADO');
  const aprobados = vigentes.filter((p) => ESTADOS_APROBADOS.includes(p.estado));
  const base = aprobados.length > 0 ? aprobados : vigentes;
  const monto = base.reduce((acc, p) => acc + Math.max(p.costoDirecto, p.costoFases), 0);
  return { monto: Math.round(monto * 100) / 100, estado: estadoMasAvanzado(vigentes.map((p) => p.estado)) };
}

/**
 * Deja al día `presupuesto_monto`, `presupuesto_costo_directo` y `presupuesto_estado` del centro de costo. El
 * presupuesto es el único dueño de esos datos. Con `orm = tx.orm.public` corre en la misma transacción que el cambio.
 */
export async function sincronizarPresupuestoCc(orm: Orm, idCentroCosto: number): Promise<ResumenCc> {
  const pptos = await orm.ppto_Principal.where((p) => p.id_centro_costo.eq(idCentroCosto)).all();
  const codigos = pptos.map((p) => p.IdPresupuesto).filter((c): c is NonNullable<typeof c> => !!c);
  const fases = codigos.length > 0 ? await orm.ppto_DetalleFases.where((f) => f.IdPresupuesto.in(codigos)).all() : [];

  const costoFases = new Map<string, number>();
  for (const f of fases) {
    if (!f.IdPresupuesto) continue;
    costoFases.set(f.IdPresupuesto, (costoFases.get(f.IdPresupuesto) ?? 0) + (Number(f.CostoDirecto) || 0));
  }

  const resumen = calcularResumenCc(
    pptos.map((p) => ({
      estado: p.estado_ppto as EstadoPpto,
      costoDirecto: Number(p.CostoDirecto) || 0,
      costoFases: p.IdPresupuesto ? (costoFases.get(p.IdPresupuesto) ?? 0) : 0,
    })),
  );

  await orm.CentroCostos.where({ id: idCentroCosto }).update({
    presupuesto_monto: toDecimalString(resumen.monto),
    presupuesto_costo_directo: toDecimalString(resumen.monto),
    // Sin presupuestos vigentes se deja el estado como estaba.
    ...(resumen.estado ? { presupuesto_estado: toVarchar<50>(textoEstadoCc(resumen.estado)) } : {}),
  });
  return resumen;
}
