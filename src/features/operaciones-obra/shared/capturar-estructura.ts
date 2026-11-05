import { toVarchar } from '../../../platform/db/varchar-helpers.js';
import { toDateOnly } from './obra-shared.js';
import type { OrmObra } from './control-avance/orm.js';

/**
 * Captura de la estructura de control de una obra desde un presupuesto aprobado (GRP G-01 y G-03):
 * cada fase pasa a ser una partida y cada categoría una subpartida, con su monto (que será su peso en el avance).
 *
 *  - `principal`: arma la estructura de la obra desde cero (partidas `CONTRACTUAL`, ítems `01`, `01.01`…).
 *  - `adicional`: agrega partidas **aparte** (`ADICIONAL`) a continuación de las que ya hay, sin tocar las existentes,
 *    aunque la fase ya exista en el Principal (SP-14).
 *
 * Es idempotente: una categoría que ya tiene su subpartida no se vuelve a crear.
 */
export type ModoCaptura = 'principal' | 'adicional';

export interface FaseOrigen {
  id: number;
  idPresupuestoDetalle: string | null;
  nombre: string | null;
}

export interface CategoriaOrigen {
  id: number;
  idPresupuestoDetalle: string | null;
  nombre: string | null;
  /** Costo directo de la categoría (texto decimal); es el monto de la subpartida. */
  costoDirecto: string | null;
}

export interface EstructuraExistente {
  /** Ítems (`01`, `02`…) de las partidas que ya tiene la obra. */
  itemsPartida: readonly string[];
  /** Categorías del presupuesto que ya tienen su subpartida en la obra. */
  categoriasCapturadas: ReadonlySet<number>;
}

export interface SubpartidaPlan {
  item: string;
  nombre: string;
  orden: number;
  idCategoria: number;
  monto: string | null;
}

export interface PartidaPlan {
  item: string;
  nombre: string;
  orden: number;
  idFase: number;
  tipo: 'CONTRACTUAL' | 'ADICIONAL';
  subpartidas: SubpartidaPlan[];
}

const dos = (n: number) => String(n).padStart(2, '0');
const recortar = (t: string) => t.trim().slice(0, 150);

/** Siguiente número de partida: sigue al mayor ítem numérico que ya existe (`01`, `02`… → 3). */
function ultimoNumero(items: readonly string[]): number {
  let max = 0;
  for (const item of items) if (/^\d+$/.test(item)) max = Math.max(max, Number.parseInt(item, 10));
  return max;
}

/** Qué partidas y subpartidas hay que crear. Puro: no toca la base de datos. */
export function planificarCaptura(args: {
  fases: readonly FaseOrigen[];
  categorias: readonly CategoriaOrigen[];
  modo: ModoCaptura;
  existente: EstructuraExistente;
}): PartidaPlan[] {
  const { fases, categorias, modo, existente } = args;
  const tipo = modo === 'adicional' ? 'ADICIONAL' : 'CONTRACTUAL';
  const plan: PartidaPlan[] = [];
  let numero = ultimoNumero(existente.itemsPartida);
  let orden = existente.itemsPartida.length;

  for (const fase of [...fases].sort((a, b) => a.id - b.id)) {
    const delaFase = categorias
      .filter((c) => c.idPresupuestoDetalle !== null && c.idPresupuestoDetalle === fase.idPresupuestoDetalle)
      .sort((a, b) => a.id - b.id);
    const pendientes = delaFase.filter((c) => !existente.categoriasCapturadas.has(c.id));
    // Una fase con categorías de las que ya está todo capturado no vuelve a crearse.
    if (delaFase.length > 0 && pendientes.length === 0) continue;

    numero++;
    orden++;
    const item = dos(numero);
    plan.push({
      item,
      nombre: recortar(fase.nombre ?? `Fase ${numero}`),
      orden,
      idFase: fase.id,
      tipo,
      subpartidas: pendientes.map((c, i) => ({
        item: `${item}.${dos(i + 1)}`,
        nombre: recortar(c.nombre ?? `Partida ${item}.${dos(i + 1)}`),
        orden: i + 1,
        idCategoria: c.id,
        monto: c.costoDirecto,
      })),
    });
  }
  return plan;
}

export interface OpcionesCaptura {
  idCentroCosto: number;
  ppto: { id: number; IdPresupuesto: string };
  /** Rango por defecto de las subpartidas (inicio y fin programado del centro de costo, `YYYY-MM-DD`). */
  inicio: string;
  fin: string;
  modo: ModoCaptura;
}

export interface ResultadoCaptura {
  partidas: number;
  subpartidas: number;
}

/**
 * Crea en `orm` las partidas y subpartidas del presupuesto. Se llama con `tx.orm.public` para que quede en la misma
 * transacción que quien la dispara (la aprobación del presupuesto o la importación manual).
 */
export async function capturarEstructura(orm: OrmObra, o: OpcionesCaptura): Promise<ResultadoCaptura> {
  const [fases, cates] = await Promise.all([
    orm.ppto_DetalleFases.where({ IdPresupuesto: toVarchar<255>(o.ppto.IdPresupuesto) }).all(),
    orm.ppto_DetalleFasesCate.where({ IdPresupuesto: toVarchar<255>(o.ppto.IdPresupuesto) }).all(),
  ]);

  // Nombres: la fase y la categoría del catálogo maestro.
  const codigosFase = [...new Set(fases.map((f) => f.IdpptoFase).filter((c): c is NonNullable<typeof c> => !!c))];
  const codigosCat = [...new Set(cates.map((c) => c.IdpptoFaseCategoria).filter((c): c is NonNullable<typeof c> => !!c))];
  const [maestroFases, maestroCats, partidas, subpartidas] = await Promise.all([
    codigosFase.length ? orm.ppto_Fases.where((f) => f.IdpptoFase.in(codigosFase)).all() : [],
    codigosCat.length ? orm.ppto_FasesCategorias.where((c) => c.IdpptoFaseCategoria.in(codigosCat)).all() : [],
    orm.obra_partida.where({ id_centro_costo: o.idCentroCosto }).all(),
    orm.obra_subpartida.where({ id_centro_costo: o.idCentroCosto }).all(),
  ]);
  const nombreFase = new Map(maestroFases.map((f) => [f.IdpptoFase, f.FaseProyecto]));
  const nombreCat = new Map(maestroCats.map((c) => [c.IdpptoFaseCategoria, c.Descripcion]));

  const plan = planificarCaptura({
    fases: fases.map((f) => ({
      id: f.id,
      idPresupuestoDetalle: f.IdPresupuestoDetalle ?? null,
      nombre: (f.IdpptoFase ? nombreFase.get(f.IdpptoFase) : null) ?? null,
    })),
    categorias: cates.map((c) => ({
      id: c.id,
      idPresupuestoDetalle: c.IdPresupuestoDetalle ?? null,
      nombre: (c.IdpptoFaseCategoria ? nombreCat.get(c.IdpptoFaseCategoria) : null) ?? null,
      costoDirecto: c.CostoDirecto ?? null,
    })),
    modo: o.modo,
    existente: {
      itemsPartida: partidas.map((p) => p.item),
      categoriasCapturadas: new Set(subpartidas.map((s) => s.id_ppto_detalle_categoria).filter((c): c is number => c != null)),
    },
  });

  let totalSub = 0;
  for (const p of plan) {
    const partida = await orm.obra_partida.create({
      id_centro_costo: o.idCentroCosto,
      item: toVarchar<20>(p.item),
      nombre: toVarchar<150>(p.nombre),
      tipo: p.tipo,
      orden: p.orden,
      id_ppto_detalle_fase: p.idFase,
    });
    for (const s of p.subpartidas) {
      totalSub++;
      await orm.obra_subpartida.create({
        id_partida: partida.id,
        id_centro_costo: o.idCentroCosto,
        item: toVarchar<20>(s.item),
        nombre: toVarchar<150>(s.nombre),
        ...(o.modo === 'adicional' ? { tipo: 'ADICIONAL' as const } : {}),
        fecha_inicio: toDateOnly(o.inicio)!,
        fecha_fin: toDateOnly(o.fin)!,
        orden: s.orden,
        id_ppto_detalle_categoria: s.idCategoria,
        monto: s.monto,
      });
    }
  }

  // La ficha recuerda de qué presupuesto salió la estructura principal.
  if (o.modo === 'principal') {
    const gen = await orm.obra_datos_generales.first({ id_centro_costo: o.idCentroCosto });
    if (gen) await orm.obra_datos_generales.where({ id: gen.id }).update({ id_presupuesto_origen: o.ppto.id });
    else await orm.obra_datos_generales.create({ id_centro_costo: o.idCentroCosto, id_presupuesto_origen: o.ppto.id });
  }

  return { partidas: plan.length, subpartidas: totalSub };
}
