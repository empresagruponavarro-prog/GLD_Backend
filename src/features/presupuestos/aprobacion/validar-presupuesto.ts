/**
 * Reglas para aprobar un presupuesto (GRP S-07): toda fase tiene categorías, toda categoría tiene ítems y todo ítem
 * lleva cantidad y costo. Puro (sin Nest ni BD) para poder probarlo con casos de D-09 y D-10.
 */
export interface ItemPresupuesto {
  id: number;
  cantidad: number;
  costoUnitario: number;
}

export interface CategoriaPresupuesto {
  id: number;
  nombre: string;
  items: ItemPresupuesto[];
}

export interface FasePresupuesto {
  id: number;
  nombre: string;
  /** Costo directo guardado en la fase (puede ser un monto escrito a mano si la fase no tiene categorías). */
  costoDirecto: number;
  categorias: CategoriaPresupuesto[];
}

export type CodigoProblema = 'SIN_FASES' | 'FASE_SIN_CATEGORIAS' | 'CATEGORIA_SIN_ITEMS' | 'ITEM_VACIO';

export interface ProblemaPresupuesto {
  codigo: CodigoProblema;
  mensaje: string;
  idFase?: number;
  idCategoria?: number;
  idItem?: number;
  fase?: string;
  categoria?: string;
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** Un ítem está vacío si le falta la cantidad o el costo (cero o negativo). */
export function itemVacio(item: ItemPresupuesto): boolean {
  return !(item.cantidad > 0) || !(item.costoUnitario > 0);
}

/** Lo que impide aprobar el presupuesto. Lista vacía = se puede aprobar. */
export function validarPresupuesto(fases: readonly FasePresupuesto[]): ProblemaPresupuesto[] {
  if (fases.length === 0) {
    return [{ codigo: 'SIN_FASES', mensaje: 'El presupuesto no tiene fases' }];
  }
  const problemas: ProblemaPresupuesto[] = [];
  for (const fase of fases) {
    if (fase.categorias.length === 0) {
      problemas.push({
        codigo: 'FASE_SIN_CATEGORIAS',
        idFase: fase.id,
        fase: fase.nombre,
        mensaje:
          fase.costoDirecto > 0
            ? `La fase «${fase.nombre}» tiene un monto escrito a mano (${soles(fase.costoDirecto)}) pero ninguna categoría con ítems: el monto de la fase es la suma de sus ítems`
            : `La fase «${fase.nombre}» no tiene categorías`,
      });
      continue;
    }
    for (const cat of fase.categorias) {
      if (cat.items.length === 0) {
        problemas.push({
          codigo: 'CATEGORIA_SIN_ITEMS',
          idFase: fase.id,
          idCategoria: cat.id,
          fase: fase.nombre,
          categoria: cat.nombre,
          mensaje: `La categoría «${cat.nombre}» de la fase «${fase.nombre}» no tiene ítems`,
        });
        continue;
      }
      for (const item of cat.items) {
        if (itemVacio(item)) {
          problemas.push({
            codigo: 'ITEM_VACIO',
            idFase: fase.id,
            idCategoria: cat.id,
            idItem: item.id,
            fase: fase.nombre,
            categoria: cat.nombre,
            mensaje: `Un ítem de «${cat.nombre}» (fase «${fase.nombre}») no tiene cantidad o costo`,
          });
        }
      }
    }
  }
  return problemas;
}

export interface PlanLimpieza {
  /** Ítems con cantidad o costo en cero. */
  itemsABorrar: number[];
  /** Categorías que no tenían ítems o que se quedan sin ellos al borrar los vacíos. */
  categoriasABorrar: number[];
  /** Fases que quedan sin categorías: no se borran, el usuario decide (agregar categorías o quitar la fase). */
  fasesSinCategorias: { id: number; nombre: string }[];
}

/** Qué borra «Limpiar vacíos»: ítems en cero y categorías sin ítems. Nunca borra una fase. */
export function planificarLimpieza(fases: readonly FasePresupuesto[]): PlanLimpieza {
  const plan: PlanLimpieza = { itemsABorrar: [], categoriasABorrar: [], fasesSinCategorias: [] };
  for (const fase of fases) {
    let quedan = 0;
    for (const cat of fase.categorias) {
      const vacios = cat.items.filter(itemVacio).map((i) => i.id);
      plan.itemsABorrar.push(...vacios);
      if (cat.items.length - vacios.length === 0) plan.categoriasABorrar.push(cat.id);
      else quedan++;
    }
    if (quedan === 0) plan.fasesSinCategorias.push({ id: fase.id, nombre: fase.nombre });
  }
  return plan;
}
