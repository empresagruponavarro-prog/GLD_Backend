import type { OrmObra } from '../shared/control-avance/orm.js';

/**
 * Lista de verificación de planos de una obra (GRP S-08): se copia del tipo de proyecto del centro de costo y se marca con
 * un check al entregar cada plano. Si falta un plano obligatorio se bloquean la liquidación y el dosier.
 */
export interface PlanoRequeridoItem {
  id_tipo_plano: number;
  codigo: string;
  nombre: string;
  obligatorio: boolean;
  entregado: boolean;
  entregado_por: string | null;
  entregado_en: string | null;
}

export interface ResumenPlanos {
  total: number;
  obligatorios: number;
  entregados_obligatorios: number;
  /** Obligatorios que todavía no se entregaron. */
  faltantes: { id_tipo_plano: number; codigo: string; nombre: string }[];
  /** No falta ningún plano obligatorio (una obra sin lista exigida está completa). */
  completo: boolean;
}

export function resumenPlanos(items: readonly PlanoRequeridoItem[]): ResumenPlanos {
  const obligatorios = items.filter((i) => i.obligatorio);
  const faltantes = obligatorios.filter((i) => !i.entregado).map((i) => ({ id_tipo_plano: i.id_tipo_plano, codigo: i.codigo, nombre: i.nombre }));
  return {
    total: items.length,
    obligatorios: obligatorios.length,
    entregados_obligatorios: obligatorios.length - faltantes.length,
    faltantes,
    completo: faltantes.length === 0,
  };
}

export interface RequeridoDelTipo {
  id_tipo_plano: number;
  obligatorio: boolean;
}

export interface RequeridoActual {
  id: number;
  id_tipo_plano: number;
  obligatorio: boolean;
  entregado: boolean;
}

/**
 * Cómo pasar la lista de una obra a la de su (nuevo) tipo de proyecto, sin perder los checks ya hechos: se agregan los que
 * faltan, se actualiza si son obligatorios y se quitan los que el tipo no pide, salvo los ya entregados. Puro.
 */
export function planificarCopia(
  delTipo: readonly RequeridoDelTipo[],
  actuales: readonly RequeridoActual[],
): { crear: RequeridoDelTipo[]; actualizar: { id: number; obligatorio: boolean }[]; borrar: number[] } {
  const pide = new Map(delTipo.map((r) => [r.id_tipo_plano, r]));
  const tiene = new Map(actuales.map((a) => [a.id_tipo_plano, a]));
  return {
    crear: delTipo.filter((r) => !tiene.has(r.id_tipo_plano)),
    actualizar: actuales
      .filter((a) => pide.has(a.id_tipo_plano) && pide.get(a.id_tipo_plano)!.obligatorio !== a.obligatorio)
      .map((a) => ({ id: a.id, obligatorio: pide.get(a.id_tipo_plano)!.obligatorio })),
    borrar: actuales.filter((a) => !pide.has(a.id_tipo_plano) && !a.entregado).map((a) => a.id),
  };
}

/** Copia la lista del tipo de proyecto a la obra (`null` = sin tipo: queda solo lo ya entregado). Con `tx.orm.public` va en la transacción. */
export async function sincronizarPlanosRequeridos(orm: OrmObra, idCentroCosto: number, idTipoProyecto: number | null): Promise<void> {
  const [delTipo, actuales] = await Promise.all([
    idTipoProyecto === null ? [] : orm.tipo_proyecto_plano.where({ id_tipo_proyecto: idTipoProyecto }).all(),
    orm.obra_plano_requerido.where({ id_centro_costo: idCentroCosto }).all(),
  ]);
  const plan = planificarCopia(
    delTipo.map((d) => ({ id_tipo_plano: d.id_tipo_plano, obligatorio: d.obligatorio })),
    actuales.map((a) => ({ id: a.id, id_tipo_plano: a.id_tipo_plano, obligatorio: a.obligatorio, entregado: a.entregado })),
  );
  for (const c of plan.crear) {
    await orm.obra_plano_requerido.create({ id_centro_costo: idCentroCosto, id_tipo_plano: c.id_tipo_plano, obligatorio: c.obligatorio });
  }
  for (const u of plan.actualizar) await orm.obra_plano_requerido.where({ id: u.id }).update({ obligatorio: u.obligatorio });
  if (plan.borrar.length > 0) await orm.obra_plano_requerido.where((r) => r.id.in(plan.borrar)).deleteAndCount();
}

/** Lista de verificación leída de la BD, con el nombre de cada tipo de plano. */
export async function cargarPlanosRequeridos(orm: OrmObra, idCentroCosto: number): Promise<PlanoRequeridoItem[]> {
  const [filas, tipos] = await Promise.all([orm.obra_plano_requerido.where({ id_centro_costo: idCentroCosto }).all(), orm.tipo_plano.all()]);
  const tipo = new Map(tipos.map((t) => [t.id, t]));
  return filas
    .filter((f) => tipo.has(f.id_tipo_plano))
    .sort((a, b) => tipo.get(a.id_tipo_plano)!.orden - tipo.get(b.id_tipo_plano)!.orden || a.id_tipo_plano - b.id_tipo_plano)
    .map((f) => ({
      id_tipo_plano: f.id_tipo_plano,
      codigo: tipo.get(f.id_tipo_plano)!.codigo,
      nombre: tipo.get(f.id_tipo_plano)!.nombre,
      obligatorio: f.obligatorio,
      entregado: f.entregado,
      entregado_por: f.entregado_por ?? null,
      entregado_en: f.entregado_en ? String(f.entregado_en) : null,
    }));
}

