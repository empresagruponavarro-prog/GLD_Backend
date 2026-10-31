import { aDia } from './calendario.js';
import { metasEfectivas, metasPorDefecto, pactadoAcumulado, peso } from './metas.js';

const d = aDia;
const W1 = d('2026-09-14'); // lunes de la semana 1 de OP-26-017 (inicio jue 17/09)
const suma = (v: number[]) => v.reduce((a, x) => a + x, 0);

describe('metas · RC-03 peso', () => {
  it('peso = días laborables', () => {
    expect(peso({ inicio: d('2026-09-23'), fin: d('2026-09-24') })).toBe(2);
    expect(peso({ inicio: d('2026-09-23'), fin: d('2026-10-26') })).toBe(29);
  });

  it('mínimo 1 (un domingo o un rango invertido)', () => {
    expect(peso({ inicio: d('2026-09-27'), fin: d('2026-09-27') })).toBe(1);
    expect(peso({ inicio: d('2026-10-05'), fin: d('2026-10-01') })).toBe(1);
  });
});

describe('metas · RC-04 reparto automático', () => {
  it('33,3 / 66,7 (desmontaje sáb 19/09 – mar 22/09, OP-26-017)', () => {
    const m = metasPorDefecto({ inicio: d('2026-09-19'), fin: d('2026-09-22') }, W1);
    expect(m.slice(0, 3)).toEqual([33.3, 66.7, 0]);
  });

  it('12,5 / 75 / 12,5 (canalización sáb 26/09 – lun 05/10, OP-26-017)', () => {
    const m = metasPorDefecto({ inicio: d('2026-09-26'), fin: d('2026-10-05') }, W1);
    expect(m.slice(0, 5)).toEqual([0, 12.5, 75, 12.5, 0]);
  });

  it('una subpartida de un solo día pone 100 en su semana', () => {
    const m = metasPorDefecto({ inicio: d('2026-09-23'), fin: d('2026-09-23') }, d('2026-09-21'));
    expect(m).toEqual([100, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('siempre devuelve 10 semanas y suma 100 (± 0,5) cuando cabe en ellas', () => {
    const m = metasPorDefecto({ inicio: d('2026-09-21'), fin: d('2026-11-14') }, d('2026-09-21'));
    expect(m).toHaveLength(10);
    expect(Math.abs(suma(m) - 100)).toBeLessThanOrEqual(0.5);
  });

  it('una subpartida que termina después de la semana 10 no completa 100', () => {
    const m = metasPorDefecto({ inicio: d('2026-09-21'), fin: d('2026-12-30') }, d('2026-09-21'));
    expect(suma(m)).toBeLessThan(100);
  });

  it('domingo de inicio/fin: no aporta días', () => {
    const m = metasPorDefecto({ inicio: d('2026-09-27'), fin: d('2026-09-29') }, W1);
    // lun 28 y mar 29 → 2 días, todos en la semana 3
    expect(m.slice(0, 4)).toEqual([0, 0, 100, 0]);
  });
});

describe('metas · metasEfectivas', () => {
  const sub = { inicio: d('2026-09-26'), fin: d('2026-10-05') };

  it('sin manuales = automáticas', () => {
    expect(metasEfectivas(sub, W1)).toEqual(metasPorDefecto(sub, W1));
    expect(metasEfectivas(sub, W1, null)).toEqual(metasPorDefecto(sub, W1));
  });

  it('una meta manual reemplaza solo su celda; las nulas usan el reparto automático', () => {
    const m = metasEfectivas(sub, W1, [null, 20, null, 80, null]);
    expect(m.slice(0, 5)).toEqual([0, 20, 75, 80, 0]);
  });
});

describe('metas · RC-05 pactado acumulado', () => {
  const sub = { inicio: d('2026-09-26'), fin: d('2026-10-05') };
  const metas = metasPorDefecto(sub, W1); // 0, 12.5, 75, 12.5

  it('antes de la semana 1 es 0', () => {
    expect(pactadoAcumulado(sub, metas, W1, d('2026-09-13'))).toBe(0);
  });

  it('al cierre de una semana suma las metas completas', () => {
    expect(pactadoAcumulado(sub, metas, W1, d('2026-09-27'))).toBeCloseTo(12.5, 6);
    expect(pactadoAcumulado(sub, metas, W1, d('2026-10-04'))).toBeCloseTo(87.5, 6);
  });

  it('a mitad de semana reparte por días laborables: mié 30/09 = 12,5 + 75 × 3/6', () => {
    expect(pactadoAcumulado(sub, metas, W1, d('2026-09-30'))).toBeCloseTo(50, 6);
  });

  it('el último día llega a 100', () => {
    expect(pactadoAcumulado(sub, metas, W1, d('2026-10-05'))).toBeCloseTo(100, 6);
  });

  it('pasada la semana 10 se limita a la suma de las metas (tope 100)', () => {
    expect(pactadoAcumulado(sub, metas, W1, d('2027-03-01'))).toBeCloseTo(100, 6);
    expect(pactadoAcumulado(sub, [60, 60, 0, 0, 0, 0, 0, 0, 0, 0], W1, d('2027-03-01'))).toBe(100);
  });

  it('con metas manuales que no suman 100 respeta lo escrito', () => {
    const manual = [0, 10, 10, 0, 0, 0, 0, 0, 0, 0];
    expect(pactadoAcumulado(sub, manual, W1, d('2026-10-04'))).toBeCloseTo(20, 6);
  });
});
