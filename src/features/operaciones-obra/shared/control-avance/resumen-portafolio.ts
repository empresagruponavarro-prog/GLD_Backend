import type { ObraCargada } from './carga-obra.js';
import type { EstadoObra, ResultadoObra } from './control-avance.types.js';
import type { EquipoObra } from './equipo.js';

/**
 * Vista del portafolio: una fila por obra con lo que necesitan las pantallas (pantalla en vivo,
 * indicadores, por cliente, equipo…). Es pura: no consulta la BD. Los conteos y agrupaciones
 * (carga por persona, KPI, distribuciones) los hace el frontend sobre esta lista (RC-20/21/24).
 */

export interface PuntoCurvaResumen {
  semana: number;
  pactado: number;
  real: number | null;
}

export interface ObraResumen {
  id_centro_costo: number;
  codigo_obra: string | null;
  /** Cliente (nombre comercial) + tienda. */
  nombre: string;
  cliente: { id: number; nombre: string } | null;
  tienda: string | null;
  departamento: string | null;
  comentario: string | null;
  equipo: EquipoObra;
  /** Estado guardado en la ficha. El efectivo (derivado de las fechas) está en `resultado.estadoEfectivo`. */
  estado_obra: EstadoObra;
  inicio: string;
  fin: string;
  /** Todo lo que calcula el motor, sin el árbol de partidas ni la Curva S completa. */
  resultado: Omit<ResultadoObra, 'partidas' | 'curvaS' | 'avisos'> & { avisos: number };
  /** Mini Curva S (pactado y real por semana); `null` si la obra no tiene partidas. */
  curva: PuntoCurvaResumen[] | null;
}

export interface DatosPantalla {
  cliente: { id: number; nombre: string } | null;
  equipo: EquipoObra;
}

/** Combina la obra cargada, el resultado del motor y los nombres de pantalla en un resumen. */
export function resumirObra(carga: ObraCargada, r: ResultadoObra, pantalla: DatosPantalla): ObraResumen {
  const { gen } = carga.filas;
  const tienda = gen?.tienda ?? null;
  const { partidas: _p, curvaS, avisos, ...resto } = r;
  void _p;
  return {
    id_centro_costo: carga.idCentroCosto,
    codigo_obra: gen?.codigo_obra ?? null,
    nombre: [pantalla.cliente?.nombre, tienda].filter(Boolean).join(' ') || carga.filas.cc.centro_costo || `Obra #${carga.idCentroCosto}`,
    cliente: pantalla.cliente,
    tienda,
    departamento: gen?.departamento ?? null,
    comentario: gen?.comentario ?? null,
    equipo: pantalla.equipo,
    estado_obra: carga.estadoObra!,
    inicio: carga.inicio!,
    fin: carga.fin!,
    resultado: { ...resto, avisos: avisos.length },
    curva: curvaS ? curvaS.semanas.map((s) => ({ semana: s.semana, pactado: s.pactado, real: s.real })) : null,
  };
}

// ─── Filtros (RC-21) ──────────────────────────────────────────────────────────

export interface FiltrosPortafolio {
  /** Año de inicio. Sin él no se filtra por año. */
  anio?: number;
  /** Con `anio`, suma las obras vigentes que iniciaron en años anteriores. Por defecto sí. */
  vigentesAnteriores?: boolean;
  /** Solo obras que no están culminadas ni canceladas (la pantalla en vivo). */
  soloVigentes?: boolean;
  cliente?: number;
  jefe?: number;
  coordinador?: number;
  departamento?: string;
  /** Estado efectivo (derivado de las fechas). */
  estado?: EstadoObra;
  /** Busca en el nombre y el código, sin distinguir mayúsculas ni tildes. */
  q?: string;
}

/** Minúsculas, sin tildes y con espacios simples. */
export const normalizar = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Vigente = no culminada ni cancelada (RC-21). */
export const esVigente = (o: Pick<ObraResumen, 'estado_obra'>): boolean => o.estado_obra !== 'CULMINADO' && o.estado_obra !== 'CANCELADA';

export function enAnio(o: Pick<ObraResumen, 'inicio' | 'estado_obra'>, anio: number, vigentesAnteriores = true): boolean {
  const y = Number(o.inicio.slice(0, 4));
  return y === anio || (vigentesAnteriores && esVigente(o) && y < anio);
}

export function filtrarObras(obras: readonly ObraResumen[], f: FiltrosPortafolio): ObraResumen[] {
  const q = normalizar(f.q);
  const dep = normalizar(f.departamento);
  return obras.filter(
    (o) =>
      (f.anio === undefined || enAnio(o, f.anio, f.vigentesAnteriores ?? true)) &&
      (!f.soloVigentes || esVigente(o)) &&
      (f.cliente === undefined || o.cliente?.id === f.cliente) &&
      (f.jefe === undefined || o.equipo.jefe_proyecto?.id === f.jefe) &&
      (f.coordinador === undefined || o.equipo.coordinador?.id === f.coordinador) &&
      (!dep || normalizar(o.departamento) === dep) &&
      (f.estado === undefined || o.resultado.estadoEfectivo === f.estado) &&
      (!q || normalizar(o.nombre).includes(q) || normalizar(o.codigo_obra).includes(q)),
  );
}

const ORDEN_ESTADO: Record<EstadoObra, number> = { EN_EJECUCION: 0, PROXIMO: 1, SUSPENDIDA: 1.5, POST_VENTA: 2, CULMINADO: 3, CANCELADA: 4 };

/** Orden de la pantalla en vivo: en ejecución, próximas, suspendidas, post venta, culminadas; por inicio dentro de cada una. */
export function ordenarObras(obras: readonly ObraResumen[]): ObraResumen[] {
  return [...obras].sort(
    (a, b) =>
      ORDEN_ESTADO[a.resultado.estadoEfectivo] - ORDEN_ESTADO[b.resultado.estadoEfectivo] ||
      a.inicio.localeCompare(b.inicio) ||
      a.id_centro_costo - b.id_centro_costo,
  );
}

// ─── Catálogos para los filtros ───────────────────────────────────────────────

export interface CatalogosPortafolio {
  clientes: { id: number; nombre: string }[];
  jefes: { id: number; nombre: string }[];
  coordinadores: { id: number; nombre: string }[];
  departamentos: string[];
  /** Años de inicio, del más reciente al más antiguo. */
  anios: number[];
}

export function catalogosDe(obras: readonly ObraResumen[]): CatalogosPortafolio {
  const unicos = (items: ({ id: number; nombre: string } | null | undefined)[]) => {
    const m = new Map<number, string>();
    for (const i of items) if (i) m.set(i.id, i.nombre);
    return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  };
  return {
    clientes: unicos(obras.map((o) => o.cliente)),
    jefes: unicos(obras.map((o) => o.equipo.jefe_proyecto)),
    coordinadores: unicos(obras.map((o) => o.equipo.coordinador)),
    departamentos: [...new Set(obras.map((o) => o.departamento).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, 'es')),
    anios: [...new Set(obras.map((o) => Number(o.inicio.slice(0, 4))))].sort((a, b) => b - a),
  };
}
