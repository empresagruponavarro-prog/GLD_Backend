import type { OrmObra } from '../shared/control-avance/orm.js';

/** Una disciplina de plano: el nombre del catálogo (columna «Disciplina» de los tipos de plano) y su prefijo de código. */
export interface DisciplinaPlano {
  nombre: string;
  /** Prefijo del código sugerido de un plano nuevo (ARQ-01, IE-02…). */
  prefijo: string;
}

const PREFIJOS_CONOCIDOS: Readonly<Record<string, string>> = {
  ARQUITECTURA: 'ARQ',
  ESTRUCTURAS: 'EST',
  'INSTALACIONES ELECTRICAS': 'IE',
  'INSTALACIONES SANITARIAS': 'IS',
  'INSTALACIONES MECANICAS': 'MEC',
  COMUNICACIONES: 'COM',
  OTROS: 'PLN',
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Nombre de disciplina tal como se guarda: sin espacios sobrantes y en mayúsculas. Puro. */
export function normalizarDisciplina(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Prefijo del código de un plano: el de siempre para las disciplinas conocidas (ARQ, EST, IE, IS, MEC, COM, PLN) y, para una
 * nueva, las 3 primeras letras de su nombre (GAS → GAS, DETALLES CONSTRUCTIVOS → DET). Puro.
 */
export function prefijoDisciplina(nombre: string): string {
  const clave = sinTildes(normalizarDisciplina(nombre));
  const conocido = PREFIJOS_CONOCIDOS[clave];
  if (conocido) return conocido;
  const letras = clave.replace(/[^A-Z]/g, '');
  return letras.slice(0, 3) || 'PLN';
}

/** Disciplinas distintas, en el orden en que aparecen (sin repetir y sin vacías). Puro. */
export function disciplinasDistintas(nombres: readonly (string | null | undefined)[]): DisciplinaPlano[] {
  const vistas = new Set<string>();
  const lista: DisciplinaPlano[] = [];
  for (const n of nombres) {
    if (!n?.trim()) continue;
    const nombre = normalizarDisciplina(n);
    if (vistas.has(nombre)) continue;
    vistas.add(nombre);
    lista.push({ nombre, prefijo: prefijoDisciplina(nombre) });
  }
  return lista;
}

/**
 * Disciplinas que se pueden elegir en una obra: las de los planos que exige su tipo de proyecto (Catálogos de proyecto). Si la
 * obra no tiene tipo de proyecto, o su tipo no pide planos con disciplina, se ofrecen todas las del catálogo de tipos de plano.
 */
export async function disciplinasDeLaObra(orm: OrmObra, idTipoProyecto: number | null): Promise<DisciplinaPlano[]> {
  const tipos = (await orm.tipo_plano.where({ activo: true }).all()).sort((a, b) => a.orden - b.orden || a.id - b.id);
  const disciplinaDe = (t: (typeof tipos)[number]) => (t.disciplina == null ? null : String(t.disciplina));
  if (idTipoProyecto !== null) {
    const pide = new Set((await orm.tipo_proyecto_plano.where({ id_tipo_proyecto: idTipoProyecto }).all()).map((p) => p.id_tipo_plano));
    const delTipo = disciplinasDistintas(tipos.filter((t) => pide.has(t.id)).map(disciplinaDe));
    if (delTipo.length > 0) return delTipo;
  }
  return disciplinasDistintas(tipos.map(disciplinaDe));
}
