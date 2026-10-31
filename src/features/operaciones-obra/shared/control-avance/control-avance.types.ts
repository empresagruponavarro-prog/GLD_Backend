/**
 * Tipos del motor de control de avance (Dashboard de Operaciones).
 * Las entradas llevan fechas ISO `YYYY-MM-DD`; internamente el motor trabaja con `Dia`
 * (días desde 1970-01-01 UTC) para no depender de zonas horarias.
 */

/** Días desde 1970-01-01 (UTC). */
export type Dia = number;

export const ESTADOS_OBRA = ['PROXIMO', 'EN_EJECUCION', 'POST_VENTA', 'CULMINADO', 'SUSPENDIDA', 'CANCELADA'] as const;
export type EstadoObra = (typeof ESTADOS_OBRA)[number];

export const MOTIVOS_REPROGRAMACION = ['CLIENTE', 'PERMISO_LICENCIA', 'PROVEEDOR_CLIENTE', 'FUERZA_MAYOR', 'INTERNO'] as const;
export type MotivoReprogramacion = (typeof MOTIVOS_REPROGRAMACION)[number];

export type TipoPartida = 'CONTRACTUAL' | 'ADICIONAL';

/** Semanas con meta (1-10) y con avance (1-16). */
export const SEMANAS_META = 10;
export const SEMANAS_AVANCE = 16;
/** Tolerancia (pp) para juzgar retraso: solo absorbe redondeos (D3). */
export const TOLERANCIA_PP = 0.5;
/** Días que se miran hacia adelante para «próximo a vencer». */
export const DIAS_PROXIMO_A_VENCER = 7;
/** Plazo de post venta cuando la obra no define uno. */
export const PLAZO_POSTVENTA_DEFECTO = 14;

// ───────────────────────────── Entradas ─────────────────────────────

export interface SubpartidaEntrada {
  item: string;
  nombre: string;
  /** Nulo = hereda el tipo de la partida. */
  tipo?: TipoPartida | null;
  inicio: string;
  fin: string;
  /** Meta manual por semana (1-10). Una celda nula usa el reparto automático. */
  metas?: (number | null)[] | null;
  /** Avance de cada semana (1-16): lo avanzado SOLO en esa semana, no el acumulado. */
  avance?: (number | null)[] | null;
}

export interface PartidaEntrada {
  item: string;
  nombre: string;
  tipo?: TipoPartida | null;
  subpartidas: SubpartidaEntrada[];
}

export interface ReprogramacionEntrada {
  desde: string;
  dias: number;
  motivo: MotivoReprogramacion;
}

export interface ObraEntrada {
  estado: EstadoObra;
  inicio: string;
  /** Fin programado original (nunca se modifica al reprogramar). */
  fin: string;
  /** Solo para obras sin subpartidas. */
  avanceGeneral?: number | null;
  fechaActualizacion?: string | null;
  entregaReal?: string | null;
  cierrePostVenta?: string | null;
  plazoPostVentaDias?: number | null;
  reprogramaciones?: ReprogramacionEntrada[];
  partidas: PartidaEntrada[];
}

// ───────────────────────────── Salidas ─────────────────────────────

export type ClaveSituacion = 'good' | 'warn' | 'crit' | 'neutral' | 'rp';

export interface Situacion {
  clave: ClaveSituacion;
  texto: string;
}

export interface SemanaTexto {
  /** Semana en curso (0 si la obra aún no empieza). */
  actual: number;
  /** Semana del fin vigente. */
  total: number;
  texto: string;
  /** La obra ya pasó la semana de su fin vigente. */
  tarde: boolean;
}

export interface PlazosObra {
  finOriginal: string;
  finVigente: string;
  /** Fin original + solo días de causa externa. */
  finControl: string;
  diasReprogramados: number;
  diasExternos: number;
  diasInternos: number;
  enPausa: boolean;
  /** Días de atraso del fin vigente a hoy (obra sin terminar), o 0. */
  diasFueraDePlazo: number;
  /** Días de retraso del avance real frente a lo que pedía el plan, o 0. */
  diasRetraso: number;
  proximoAVencer: boolean;
}

export interface PostVentaInfo {
  inicio: string;
  cierre: string | null;
  dias: number;
  texto: string;
  cerrada: boolean;
}

export interface MetricasItem {
  /** Real acumulado (0-100, sin redondear salvo la regla del 99,5). */
  real: number;
  /** Programado al corte (cierre de la semana anterior). */
  programado: number;
  /** Programado al cierre de la semana en curso. */
  programadoFinSemana: number;
  desviacion: number;
  situacion: Situacion;
}

export interface SubpartidaResultado extends MetricasItem {
  item: string;
  nombre: string;
  tipo: TipoPartida;
  inicio: string;
  fin: string;
  peso: number;
  diasLaborables: number;
  metas: number[];
  sinAvance: boolean;
  estadoCronograma: Situacion;
}

export interface PartidaResultado extends MetricasItem {
  item: string;
  nombre: string;
  tipo: TipoPartida;
  inicio: string;
  fin: string;
  peso: number;
  subpartidas: SubpartidaResultado[];
}

export interface PuntoCurvaS {
  semana: number;
  desde: string;
  hasta: string;
  /** Pactado de control acumulado (corrido por pausas externas). */
  pactado: number;
  /** Pactado original acumulado (sin pausas). */
  pactadoOriginal: number;
  /** Real acumulado; nulo en semanas futuras. */
  real: number | null;
  /** Días de pausa por reprogramación dentro de la semana. */
  diasPausa: number;
  semanaEnPausa: boolean;
  enCurso: boolean;
}

export interface CurvaS {
  inicioSemana1: string;
  semanas: PuntoCurvaS[];
  /** Última semana cerrada (índice 1-based en `semanas`, 0 si ninguna). */
  semanaCorte: number;
  /** Más de 16 semanas con las reprogramaciones. */
  excede: boolean;
}

export interface AvisoCarga {
  codigo: string;
  ambito: 'obra' | 'subpartida';
  item?: string;
  mensaje: string;
}

export interface ResultadoObra extends MetricasItem {
  estadoEfectivo: EstadoObra;
  sinPartidas: boolean;
  sinAvance: boolean;
  semana: SemanaTexto;
  plazos: PlazosObra;
  postVenta: PostVentaInfo | null;
  /** Programado al corte, el corte y la semana que cierra. */
  corte: string;
  partidas: PartidaResultado[];
  curvaS: CurvaS | null;
  adicionales: { subpartidas: number; avance: number; pesoPct: number } | null;
  avisos: AvisoCarga[];
}
