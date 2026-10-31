import { toVarchar } from '../../../../platform/db/varchar-helpers.js';
import type { OrmObra } from './orm.js';

export const TIPOS_EVENTO_OBRA = ['ALTA', 'ESTADO', 'AVANCE', 'PLAZO', 'EQUIPO', 'REPROGRAMACION', 'SITUACION', 'VENCIDO', 'SOBRECARGA'] as const;
export type TipoEventoObra = (typeof TIPOS_EVENTO_OBRA)[number];
export type SeveridadEvento = 'info' | 'good' | 'warn' | 'crit';

export interface NuevoEvento {
  idCentroCosto: number;
  tipo: TipoEventoObra;
  titulo: string;
  detalle?: string | null;
  antes?: string | null;
  despues?: string | null;
  severidad?: SeveridadEvento;
  usuario?: string | null;
}

const recortar = (v: string | null | undefined, max: number) => (v == null ? null : v.length > max ? `${v.slice(0, max - 1)}…` : v);

/**
 * Historial de la obra (RF-OP-50/54). Se llama con `tx.orm.public` para que el evento quede en la
 * MISMA transacción que el cambio que lo origina: si el cambio se revierte, el evento también.
 */
export async function registrarEvento(orm: OrmObra, e: NuevoEvento): Promise<void> {
  await orm.obra_evento.create({
    id_centro_costo: e.idCentroCosto,
    tipo: e.tipo,
    titulo: toVarchar<200>(recortar(e.titulo, 200) ?? ''),
    detalle: toVarchar<1000>(recortar(e.detalle, 1000)),
    valor_antes: toVarchar<200>(recortar(e.antes, 200)),
    valor_despues: toVarchar<200>(recortar(e.despues, 200)),
    severidad: toVarchar<10>(e.severidad ?? 'info'),
    usuario: toVarchar<255>(e.usuario ?? null),
  });
}
