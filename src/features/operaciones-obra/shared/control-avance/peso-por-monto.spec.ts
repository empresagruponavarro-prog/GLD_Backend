import type { ObraEntrada, SubpartidaEntrada } from './control-avance.types.js';
import { usaMontoComoPeso } from './metas.js';
import { calcularCurvaS, calcularObra } from './motor.js';

/**
 * GRP S-02 / SP-03 · el peso de una subpartida en el avance es su monto en el presupuesto, siempre que todas las
 * subpartidas de la obra lo tengan; si no, la duración (como las obras que vinieron del Excel).
 * Base: dos subpartidas idénticas en fechas (12 días laborables, 21/09–03/10); «hoy» = mar 06/10/2026.
 */
const HOY = '2026-10-06';

const sub = (item: string, extra: Partial<SubpartidaEntrada> = {}): SubpartidaEntrada => ({
  item,
  nombre: `Sub ${item}`,
  inicio: '2026-09-21',
  fin: '2026-10-03',
  ...extra,
});

const obra = (subs: SubpartidaEntrada[], partidas?: ObraEntrada['partidas']): ObraEntrada => ({
  estado: 'EN_EJECUCION',
  inicio: '2026-09-21',
  fin: '2026-10-24',
  reprogramaciones: [],
  partidas: partidas ?? [{ item: '01', nombre: 'Partida 01', subpartidas: subs }],
});

describe('usaMontoComoPeso', () => {
  it('solo si todas las subpartidas traen un monto mayor a cero', () => {
    expect(usaMontoComoPeso([{ monto: 900 }, { monto: 100 }])).toBe(true);
    expect(usaMontoComoPeso([{ monto: 900 }, { monto: null }])).toBe(false);
    expect(usaMontoComoPeso([{ monto: 900 }, {}])).toBe(false);
    expect(usaMontoComoPeso([{ monto: 900 }, { monto: 0 }])).toBe(false);
    expect(usaMontoComoPeso([{ monto: Number.NaN }])).toBe(false);
  });

  it('sin subpartidas no hay monto que usar', () => {
    expect(usaMontoComoPeso([])).toBe(false);
  });
});

describe('motor · peso por monto', () => {
  // Una subpartida cara terminada y otra barata sin empezar.
  const cara = (monto?: number | null) => sub('01.01', { avance: [100], monto });
  const barata = (monto?: number | null) => sub('01.02', { avance: [0], monto });

  it('con montos, el avance de la obra pesa por dinero: 900 terminados y 100 sin empezar = 90 %', () => {
    const r = calcularObra(obra([cara(900), barata(100)]), HOY);
    expect(r.pesoPor).toBe('MONTO');
    expect(r.real).toBeCloseTo(90, 6);
    const [a, b] = r.partidas[0].subpartidas;
    expect([a.peso, b.peso]).toEqual([900, 100]);
    expect([a.pesoPct, b.pesoPct]).toEqual([90, 10]);
    expect(r.partidas[0].pesoPct).toBe(100);
  });

  it('sin montos pesa por duración, como siempre: dos subpartidas iguales = 50 %', () => {
    const r = calcularObra(obra([cara(), barata()]), HOY);
    expect(r.pesoPor).toBe('DURACION');
    expect(r.real).toBeCloseTo(50, 6);
    const [a, b] = r.partidas[0].subpartidas;
    expect([a.peso, b.peso]).toEqual([12, 12]);
    expect([a.pesoPct, b.pesoPct]).toEqual([50, 50]);
  });

  it('si a una sola le falta el monto, toda la obra pesa por duración (no se mezclan montos con días)', () => {
    const r = calcularObra(obra([cara(900), barata(null)]), HOY);
    expect(r.pesoPor).toBe('DURACION');
    expect(r.real).toBeCloseTo(50, 6);
  });

  it('un monto en cero cuenta como faltante', () => {
    const r = calcularObra(obra([cara(900), barata(0)]), HOY);
    expect(r.pesoPor).toBe('DURACION');
  });

  it('el monto pesa entre partidas: el porcentaje de cada partida es la suma de sus subpartidas', () => {
    const r = calcularObra(
      obra([], [
        { item: '01', nombre: 'Partida 01', subpartidas: [sub('01.01', { avance: [100], monto: 600 }), sub('01.02', { avance: [100], monto: 200 })] },
        { item: '02', nombre: 'Partida 02', subpartidas: [sub('02.01', { avance: [0], monto: 200 })] },
      ]),
      HOY,
    );
    expect(r.partidas.map((p) => p.pesoPct)).toEqual([80, 20]);
    expect(r.real).toBeCloseTo(80, 6);
  });

  it('los adicionales reportan su peso por monto', () => {
    const r = calcularObra(
      obra([], [
        { item: '01', nombre: 'Contractual', tipo: 'CONTRACTUAL', subpartidas: [sub('01.01', { avance: [100], monto: 900 })] },
        { item: '02', nombre: 'Adicional', tipo: 'ADICIONAL', subpartidas: [sub('02.01', { avance: [0], monto: 100 })] },
      ]),
      HOY,
    );
    expect(r.adicionales).toEqual({ subpartidas: 1, avance: 0, pesoPct: 10 });
  });

  it('la Curva S usa los mismos pesos que el avance de la obra', () => {
    const entrada = obra([cara(900), barata(100)]);
    const real = calcularObra(entrada, HOY).real;
    const curva = calcularCurvaS(entrada, HOY);
    const semana1 = curva.semanas.find((p) => p.semana === 1);
    expect(semana1?.real).toBeCloseTo(real, 6);
  });
});
