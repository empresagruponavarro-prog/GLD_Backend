import { aDia, deDia, diasLaborables, semanaDeFecha, semanaObra, textoDiaMes } from './calendario.js';
import { desviacion, promedioPonderado, realAcumulado, tieneAvance, truncar } from './avance.js';
import {
  TOLERANCIA_PP,
  type Dia,
  type EstadoObra,
  type MetricasItem,
  type ObraEntrada,
  type PartidaResultado,
  type PlazosObra,
  type ResultadoObra,
  type SemanaTexto,
  type SubpartidaResultado,
  type TipoPartida,
} from './control-avance.types.js';
import { curvaS, type FiltroTipoCurva, type SubpartidaCurva } from './curva-s.js';
import { metasEfectivas, peso } from './metas.js';
import { diasDeRetraso, diasFueraDePlazo, proximoAVencer } from './plazos.js';
import { postVenta } from './postventa.js';
import {
  esMotivoExterno,
  finControl as calcularFinControl,
  finVigente as calcularFinVigente,
  pactadoControl,
  pausaVigente,
  resumenReprogramacion,
  soloExternas,
  type Pausa,
} from './reprogramacion.js';
import { enEjecucion, estadoCronograma, situacion } from './situacion.js';
import { avisosCarga, obraTieneAvance } from './validaciones.js';

/**
 * Motor de control de avance. `calcularObra` recibe lo que la gente escribe (ficha, partidas,
 * metas, avance semanal, reprogramaciones) y `hoy` (fecha de Lima, `YYYY-MM-DD`) y devuelve todo
 * lo demás ya calculado: programado, real, desviación, situación, plazos, post venta, Curva S y
 * avisos. No toca la base de datos ni la hora del sistema.
 */

/** Programado lineal de una obra sin subpartidas: días laborables transcurridos ÷ totales. */
function programadoLineal(inicio: Dia, fin: Dia, en: Dia): number {
  if (en < inicio) return 0;
  const total = diasLaborables(inicio, fin);
  if (!total) return en >= fin ? 100 : 0;
  return Math.min(1, diasLaborables(inicio, Math.min(en, fin)) / total) * 100;
}

/** Estado con el que se evalúa: «próximo» y «en ejecución» se derivan de las fechas (RF-OP-21). */
export function estadoEfectivo(estado: EstadoObra, inicio: Dia, hoy: Dia): EstadoObra {
  if (estado === 'PROXIMO' || estado === 'EN_EJECUCION') return inicio > hoy ? 'PROXIMO' : 'EN_EJECUCION';
  return estado;
}

interface SubInterna {
  partidaIdx: number;
  item: string;
  nombre: string;
  tipo: TipoPartida;
  inicio: Dia;
  fin: Dia;
  peso: number;
  metas: number[];
  avance: (number | null)[];
}

interface Contexto {
  entrada: ObraEntrada;
  hoy: Dia;
  inicio: Dia;
  finOriginal: Dia;
  estado: EstadoObra;
  ej: boolean;
  fz: boolean;
  w1: Dia;
  corte: Dia;
  cierreSemana: Dia;
  semanaEnCurso: number;
  semanasCerradas: number;
  pausas: Pausa[];
  externas: Pausa[];
  finVigente: Dia;
  finControl: Dia;
  subs: SubInterna[];
}

function preparar(entrada: ObraEntrada, hoyIso: string): Contexto {
  const hoy = aDia(hoyIso);
  const inicio = aDia(entrada.inicio);
  const finOriginal = aDia(entrada.fin);
  const estado = estadoEfectivo(entrada.estado, inicio, hoy);
  const cal = semanaObra(inicio, hoy);
  // «Aplica a» (reprogramar una sola partida) queda fuera de este motor (D5).
  const pausas: Pausa[] = (entrada.reprogramaciones ?? []).map((r) => ({ desde: aDia(r.desde), dias: r.dias, externa: esMotivoExterno(r.motivo) }));

  const subs: SubInterna[] = [];
  entrada.partidas.forEach((p, partidaIdx) => {
    for (const s of p.subpartidas) {
      const tramo = { inicio: aDia(s.inicio), fin: aDia(s.fin) };
      subs.push({
        partidaIdx,
        item: s.item,
        nombre: s.nombre,
        tipo: s.tipo ?? p.tipo ?? 'CONTRACTUAL',
        ...tramo,
        peso: peso(tramo),
        metas: metasEfectivas(tramo, cal.w1, s.metas),
        avance: s.avance ?? [],
      });
    }
  });

  return {
    entrada,
    hoy,
    inicio,
    finOriginal,
    estado,
    ej: enEjecucion(estado),
    fz: estado === 'SUSPENDIDA' || estado === 'CANCELADA',
    w1: cal.w1,
    corte: cal.corte,
    cierreSemana: cal.cierreSemanaEnCurso,
    semanaEnCurso: cal.semanaEnCurso,
    semanasCerradas: cal.semanasCerradas,
    pausas,
    externas: soloExternas(pausas),
    finVigente: calcularFinVigente(finOriginal, pausas),
    finControl: calcularFinControl(finOriginal, pausas),
    subs,
  };
}

const sinSub = (c: Contexto) => c.subs.length === 0;

/** Programado de control de una subpartida en una fecha. */
const programadoSub = (c: Contexto, s: SubInterna, en: Dia) => pactadoControl(s, s.metas, c.w1, en, c.externas);

/** Programado de control de toda la obra en una fecha (ponderado), o lineal si no hay subpartidas. */
function programadoObraEn(c: Contexto, en: Dia): number {
  if (sinSub(c)) return programadoLineal(c.inicio, c.finControl, en);
  return promedioPonderado(c.subs.map((s) => ({ peso: s.peso, valor: programadoSub(c, s, en) })));
}

function metricas(c: Contexto, real: number, programado: number, finSemana: number, nivel: 'obra' | 'item', inicio: Dia, riesgo: boolean, enPausa: boolean): MetricasItem {
  return {
    real,
    programado,
    programadoFinSemana: finSemana,
    desviacion: desviacion(real, programado),
    situacion: situacion({
      nivel,
      estado: c.estado,
      real,
      programado,
      programadoFinSemana: finSemana,
      inicio,
      hoy: c.hoy,
      semanaEnCurso: c.semanaEnCurso,
      riesgo,
      enPausa,
      finControl: c.finControl,
    }),
  };
}

function resultadoSub(c: Contexto, s: SubInterna): SubpartidaResultado {
  const sinAvance = !tieneAvance(s.avance);
  const real = realAcumulado(s.avance) ?? 0;
  const programado = c.ej ? programadoSub(c, s, c.corte) : c.fz ? real : 100;
  const finSemana = c.ej ? programadoSub(c, s, c.cierreSemana) : programado;
  const m = metricas(c, real, programado, finSemana, 'item', s.inicio, false, false);
  return {
    ...m,
    item: s.item,
    nombre: s.nombre,
    tipo: s.tipo,
    inicio: deDia(s.inicio),
    fin: deDia(s.fin),
    peso: s.peso,
    diasLaborables: diasLaborables(s.inicio, s.fin),
    metas: s.metas,
    sinAvance,
    estadoCronograma: estadoCronograma({ nivel: 'item', estado: c.estado, real, programado, inicio: s.inicio, corte: c.corte }),
  };
}

const retrasada = (r: SubpartidaResultado) => r.real < 100 && r.situacion.texto === 'Retrasada';

function resultadoPartida(c: Contexto, idx: number, subs: SubpartidaResultado[]): PartidaResultado {
  const p = c.entrada.partidas[idx];
  const w = subs.map((s) => ({ peso: s.peso }));
  const prom = (f: (s: SubpartidaResultado) => number) => promedioPonderado(subs.map((s, i) => ({ peso: w[i].peso, valor: f(s) })));
  const inicio = Math.min(...subs.map((s) => aDia(s.inicio)));
  const fin = Math.max(...subs.map((s) => aDia(s.fin)));
  const riesgo = c.ej && subs.some(retrasada);
  const m = metricas(c, prom((s) => s.real), prom((s) => s.programado), prom((s) => s.programadoFinSemana), 'item', inicio, riesgo, false);
  return {
    ...m,
    item: p.item,
    nombre: p.nombre,
    tipo: p.tipo ?? (subs.every((s) => s.tipo === 'ADICIONAL') ? 'ADICIONAL' : 'CONTRACTUAL'),
    inicio: deDia(inicio),
    fin: deDia(fin),
    peso: subs.reduce((a, s) => a + s.peso, 0),
    subpartidas: subs,
  };
}

function textoSemana(c: Contexto): SemanaTexto {
  const total = Math.max(1, semanaDeFecha(c.w1, c.finVigente));
  const actual = c.semanaEnCurso;
  if (c.estado === 'POST_VENTA') return { actual, total, texto: 'Post venta', tarde: false };
  if (!c.ej) return { actual, total, texto: '—', tarde: false };
  if (c.inicio > c.hoy) return { actual, total, texto: `Inicia ${textoDiaMes(c.inicio)}`, tarde: false };
  return { actual, total, texto: `Sem ${actual} de ${total}`, tarde: actual > total };
}

/** Datos de las subpartidas para la Curva S. */
function paraCurva(c: Contexto): SubpartidaCurva[] {
  return c.subs.map((s) => ({ inicio: s.inicio, fin: s.fin, peso: s.peso, metas: s.metas, avance: s.avance, adicional: s.tipo === 'ADICIONAL' }));
}

function contextoCurva(c: Contexto) {
  return {
    subpartidas: paraCurva(c),
    w1: c.w1,
    hoy: c.hoy,
    enEjecucion: c.ej,
    semanaEnCurso: c.semanaEnCurso,
    semanasCerradas: c.semanasCerradas,
    finVigente: c.finVigente,
    pausas: c.pausas,
    externas: c.externas,
  };
}

/** RC-22/23: Curva S de la obra, con el filtro Todo · Contractual · Adicionales. */
export function calcularCurvaS(entrada: ObraEntrada, hoy: string, tipo: FiltroTipoCurva = 'todo') {
  return curvaS(contextoCurva(preparar(entrada, hoy)), tipo);
}

export function calcularObra(entrada: ObraEntrada, hoyIso: string): ResultadoObra {
  const c = preparar(entrada, hoyIso);

  // Subpartidas y partidas
  const subRes = c.subs.map((s) => resultadoSub(c, s));
  const partidas: PartidaResultado[] = [];
  entrada.partidas.forEach((_p, idx) => {
    const delaPartida = subRes.filter((_r, i) => c.subs[i].partidaIdx === idx);
    if (delaPartida.length) partidas.push(resultadoPartida(c, idx, delaPartida));
  });

  // Obra
  const sinPartidas = sinSub(c);
  const sinAvance = sinPartidas ? entrada.avanceGeneral == null : !obraTieneAvance(entrada);
  const pesos = subRes.map((s) => s.peso);
  const prom = (f: (s: SubpartidaResultado) => number) => promedioPonderado(subRes.map((s, i) => ({ peso: pesos[i], valor: f(s) })));

  const real = sinPartidas ? (entrada.avanceGeneral ?? 0) : prom((s) => s.real);
  let programado: number;
  let finSemana: number;
  if (!c.ej) {
    programado = c.fz ? real : 100;
    finSemana = programado;
  } else if (sinPartidas) {
    programado = programadoLineal(c.inicio, c.finControl, c.corte);
    finSemana = programadoLineal(c.inicio, c.finControl, c.cierreSemana);
  } else {
    programado = prom((s) => s.programado);
    finSemana = prom((s) => s.programadoFinSemana);
  }

  const pausa = c.ej ? pausaVigente(c.pausas, c.hoy) : null;
  const riesgo = c.ej && subRes.some(retrasada);
  const metricasObra = metricas(c, real, programado, finSemana, 'obra', c.inicio, riesgo, pausa !== null);

  // Plazos
  const resumen = resumenReprogramacion(c.pausas);
  const realParaPlazos = truncar(real) >= 100 ? 100 : real;
  const plazos: PlazosObra = {
    finOriginal: deDia(c.finOriginal),
    finVigente: deDia(c.finVigente),
    finControl: deDia(c.finControl),
    ...resumen,
    enPausa: pausa !== null,
    diasFueraDePlazo: diasFueraDePlazo({ enEjecucion: c.estado === 'EN_EJECUCION', inicio: c.inicio, real: realParaPlazos, finVigente: c.finVigente, hoy: c.hoy }),
    diasRetraso: diasDeRetraso({
      enEjecucion: c.estado === 'EN_EJECUCION',
      inicio: c.inicio,
      hoy: c.hoy,
      real,
      sinAvance,
      enPausa: pausa !== null,
      corte: c.corte,
      programadoEn: (d) => programadoObraEn(c, d),
      tolerancia: TOLERANCIA_PP,
    }),
    proximoAVencer: proximoAVencer({ enEjecucion: c.estado === 'EN_EJECUCION', inicio: c.inicio, finControl: c.finControl, hoy: c.hoy }),
  };

  const pv =
    c.estado === 'POST_VENTA' || c.estado === 'CULMINADO'
      ? postVenta(entrada.entregaReal ? aDia(entrada.entregaReal) : null, c.finOriginal, entrada.cierrePostVenta ? aDia(entrada.cierrePostVenta) : null, c.hoy)
      : null;

  // RC-23: resumen de adicionales
  const adic = subRes.filter((s) => s.tipo === 'ADICIONAL');
  const pesoTotal = pesos.reduce((a, v) => a + v, 0);
  const adicionales = adic.length
    ? {
        subpartidas: adic.length,
        avance: Math.round(promedioPonderado(adic.map((s) => ({ peso: s.peso, valor: s.real })))),
        pesoPct: Math.round((adic.reduce((a, s) => a + s.peso, 0) / pesoTotal) * 100),
      }
    : null;

  const avisos = avisosCarga(entrada, { hoy: c.hoy, w1: c.w1, real, sinAvance });

  return {
    ...metricasObra,
    estadoEfectivo: c.estado,
    sinPartidas,
    sinAvance,
    semana: textoSemana(c),
    plazos,
    postVenta: pv
      ? { inicio: deDia(pv.inicio), cierre: pv.cierre === null ? null : deDia(pv.cierre), dias: pv.dias, texto: pv.texto, cerrada: pv.cerrada }
      : null,
    corte: deDia(c.corte),
    partidas,
    curvaS: sinPartidas ? null : curvaS(contextoCurva(c)),
    adicionales,
    avisos,
  };
}

