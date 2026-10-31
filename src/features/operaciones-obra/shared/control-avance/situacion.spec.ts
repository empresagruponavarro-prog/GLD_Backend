import { aDia } from './calendario.js';
import { enEjecucion, estadoCronograma, situacion, sinSemana, type EntradaSituacion } from './situacion.js';

const d = aDia;
const HOY = d('2026-10-19');

/** Obra en ejecución al día en todo: valores base que cada caso modifica. */
const base = (p: Partial<EntradaSituacion> = {}): EntradaSituacion => ({
  nivel: 'item',
  estado: 'EN_EJECUCION',
  real: 50,
  programado: 50,
  programadoFinSemana: 50,
  inicio: d('2026-09-21'),
  hoy: HOY,
  semanaEnCurso: 5,
  riesgo: false,
  ...p,
});

describe('situación · RC-12 (una rama por caso, en el orden de la tabla)', () => {
  it('1 · Suspendida y Cancelada ganan a todo lo demás', () => {
    expect(situacion(base({ estado: 'SUSPENDIDA', real: 100 })).texto).toBe('Suspendida');
    expect(situacion(base({ estado: 'CANCELADA', real: 0, programado: 90 })).texto).toBe('Cancelada');
  });

  it('2 · En pausa (obra en ejecución con una pausa vigente), aunque esté retrasada', () => {
    expect(situacion(base({ nivel: 'obra', enPausa: true, real: 10, programado: 60 }))).toEqual({ clave: 'rp', texto: 'En pausa' });
  });

  it('2 · En pausa no aplica a subpartidas ni a obras entregadas', () => {
    expect(situacion(base({ nivel: 'item', enPausa: true, real: 10, programado: 60 })).texto).toBe('Retrasada');
  });

  it('3 · Entregada: obra en post venta o culminada', () => {
    expect(situacion(base({ nivel: 'obra', estado: 'POST_VENTA' })).texto).toBe('Entregada');
    expect(situacion(base({ nivel: 'obra', estado: 'CULMINADO', real: 40 })).texto).toBe('Entregada');
  });

  it('4 · Completada (subpartida o partida al 100 %)', () => {
    expect(situacion(base({ real: 100, programado: 100 }))).toEqual({ clave: 'good', texto: 'Completada' });
  });

  it('4 · Por entregar: obra al 100 % sin entregar; ámbar si ya pasó el fin de control', () => {
    const o = base({ nivel: 'obra', real: 100, programado: 100, finControl: d('2026-10-26') });
    expect(situacion(o)).toEqual({ clave: 'good', texto: 'Por entregar' });
    expect(situacion({ ...o, finControl: d('2026-10-10') })).toEqual({ clave: 'warn', texto: 'Por entregar' });
  });

  it('5 · Por iniciar: aún no empieza y no tiene avance', () => {
    expect(situacion(base({ inicio: d('2026-10-20'), real: 0, programado: 0 })).texto).toBe('Por iniciar');
  });

  it('5 · Una subpartida que empieza hoy no es «Por iniciar»', () => {
    expect(situacion(base({ inicio: HOY, real: 0, programado: 0, programadoFinSemana: 100 })).texto).toBe('Al día · Sem 5 en curso');
  });

  it('6 · Retrasada: una semana cerrada no llegó a lo programado (más de 0,5 pp)', () => {
    expect(situacion(base({ real: 40, programado: 50 }))).toEqual({ clave: 'crit', texto: 'Retrasada' });
  });

  it('6 · La tolerancia de 0,5 pp solo absorbe redondeos', () => {
    expect(situacion(base({ real: 49.6, programado: 50 })).texto).not.toBe('Retrasada');
    expect(situacion(base({ real: 49.4, programado: 50 })).texto).toBe('Retrasada');
    expect(situacion(base({ real: 49.5, programado: 50 })).texto).not.toBe('Retrasada'); // 49,5 + 0,5 = 50, no es menor
  });

  it('7 · En riesgo: va al día en promedio pero con una subpartida retrasada', () => {
    expect(situacion(base({ riesgo: true }))).toEqual({ clave: 'warn', texto: 'En riesgo' });
  });

  it('7 · Retrasada gana a En riesgo', () => {
    expect(situacion(base({ riesgo: true, real: 40, programado: 50 })).texto).toBe('Retrasada');
  });

  it('8 · Al día · Sem N en curso: cumplió lo cerrado pero aún no llega a la meta de esta semana', () => {
    expect(situacion(base({ real: 50, programado: 50, programadoFinSemana: 80 }))).toEqual({ clave: 'neutral', texto: 'Al día · Sem 5 en curso' });
  });

  it('8 · sin semana en curso el texto es genérico', () => {
    expect(situacion(base({ semanaEnCurso: 0, programadoFinSemana: 80 })).texto).toBe('Al día · en curso');
  });

  it('9 · A tiempo: cumple la meta de esta semana', () => {
    expect(situacion(base({ real: 80, programado: 50, programadoFinSemana: 80 }))).toEqual({ clave: 'good', texto: 'A tiempo' });
  });

  it('la semana en curso no se juzga: 98,5 % pactado a fin de semana con 79,4 % real sigue «Al día» (OP-26-020)', () => {
    const s = situacion(base({ nivel: 'obra', real: 79.4, programado: 79.4, programadoFinSemana: 98.5 }));
    expect(s.texto).toBe('Al día · Sem 5 en curso');
  });

  it('enEjecucion incluye a los próximos', () => {
    expect(enEjecucion('PROXIMO')).toBe(true);
    expect(enEjecucion('EN_EJECUCION')).toBe(true);
    expect(enEjecucion('POST_VENTA')).toBe(false);
  });

  it('sinSemana: «Al día…» se muestra «A tiempo» en la vista Partidas', () => {
    expect(sinSemana({ clave: 'neutral', texto: 'Al día · Sem 5 en curso' })).toEqual({ clave: 'good', texto: 'A tiempo' });
    expect(sinSemana({ clave: 'crit', texto: 'Retrasada' }).texto).toBe('Retrasada');
  });
});

describe('situación · RC-13 estado del cronograma (como MS Project, al corte)', () => {
  const corte = d('2026-10-18');
  const e = (p: Partial<Parameters<typeof estadoCronograma>[0]> = {}) =>
    estadoCronograma({ nivel: 'item', estado: 'EN_EJECUCION', real: 50, programado: 50, inicio: d('2026-09-21'), corte, ...p });

  it('Completada: real ≥ 99,95 o la obra ya no está en ejecución', () => {
    expect(e({ real: 99.95 }).texto).toBe('Completada');
    expect(e({ estado: 'POST_VENTA', real: 10 }).texto).toBe('Completada');
  });
  it('Tarea futura: empieza después del corte', () => {
    expect(e({ inicio: d('2026-10-19'), real: 0, programado: 0 }).texto).toBe('Tarea futura');
  });
  it('Retrasada / A tiempo', () => {
    expect(e({ real: 40 }).texto).toBe('Retrasada');
    expect(e({ real: 50 }).texto).toBe('A tiempo');
  });
  it('En pausa solo en la obra', () => {
    expect(e({ nivel: 'obra', enPausa: true }).texto).toBe('En pausa');
    expect(e({ nivel: 'item', enPausa: true }).texto).toBe('A tiempo');
  });
  it('Suspendida y Cancelada', () => {
    expect(e({ estado: 'SUSPENDIDA' }).texto).toBe('Suspendida');
    expect(e({ estado: 'CANCELADA' }).texto).toBe('Cancelada');
  });
});
